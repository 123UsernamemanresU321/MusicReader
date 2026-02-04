/**
 * Library Module
 * Score listing, search, filter, favorites, and management
 */

import { supabase, getCurrentUser, deleteFile } from './supabaseClient.js';
import { navigate } from './router.js';
import { logout } from './auth.js';
import { showUploadModal } from './uploader.js';
import { showSetlistsModal } from './setlists.js';
import {
    showToast,
    showConfirm,
    formatDate,
    debounce,
    escapeHtml,
    storage
} from './utils.js';

// State
let scores = [];
let searchQuery = '';
let sortBy = 'recent';
let filterType = 'all';
let showFavoritesOnly = false;

/**
 * Render the library page
 */
export async function renderLibraryPage() {
    const app = document.getElementById('app');
    const user = await getCurrentUser();

    app.innerHTML = `
    <div class="library-container">
      <header class="library-header">
        <div class="header-left">
          <h1 class="app-title">🎵 MusicReader</h1>
        </div>
        <div class="header-right">
          <button id="setlists-btn" class="btn btn-ghost" title="Setlists">
            📋 Setlists
          </button>
          <button id="settings-btn" class="btn btn-ghost" title="Settings">
            ⚙️
          </button>
          <button id="logout-btn" class="btn btn-ghost" title="Log out">
            Log out
          </button>
        </div>
      </header>
      
      <div class="library-toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input 
              type="search" 
              id="search-input" 
              placeholder="Search by title, composer, or tags..."
              value="${escapeHtml(searchQuery)}"
            />
          </div>
        </div>
        
        <div class="toolbar-right">
          <select id="filter-type" class="select-input">
            <option value="all" ${filterType === 'all' ? 'selected' : ''}>All Types</option>
            <option value="pdf" ${filterType === 'pdf' ? 'selected' : ''}>PDF Only</option>
            <option value="musicxml" ${filterType === 'musicxml' ? 'selected' : ''}>MusicXML Only</option>
          </select>
          
          <select id="sort-by" class="select-input">
            <option value="recent" ${sortBy === 'recent' ? 'selected' : ''}>Recently Opened</option>
            <option value="created" ${sortBy === 'created' ? 'selected' : ''}>Date Added</option>
            <option value="title" ${sortBy === 'title' ? 'selected' : ''}>Title A-Z</option>
          </select>
          
          <button id="favorites-toggle" class="btn ${showFavoritesOnly ? 'btn-primary' : 'btn-ghost'}">
            ⭐ Favorites
          </button>
          
          <button id="upload-btn" class="btn btn-primary">
            + Upload Score
          </button>
        </div>
      </div>
      
      <main class="library-content">
        <div id="scores-container" class="scores-grid">
          <div class="loading-scores">Loading your scores...</div>
        </div>
      </main>
    </div>
  `;

    // Attach event listeners
    document.getElementById('search-input').addEventListener('input',
        debounce((e) => {
            searchQuery = e.target.value;
            renderScoresList();
        }, 300)
    );

    document.getElementById('filter-type').addEventListener('change', (e) => {
        filterType = e.target.value;
        renderScoresList();
    });

    document.getElementById('sort-by').addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderScoresList();
    });

    document.getElementById('favorites-toggle').addEventListener('click', (e) => {
        showFavoritesOnly = !showFavoritesOnly;
        e.target.classList.toggle('btn-primary', showFavoritesOnly);
        e.target.classList.toggle('btn-ghost', !showFavoritesOnly);
        renderScoresList();
    });

    document.getElementById('upload-btn').addEventListener('click', () => {
        showUploadModal(() => loadScores());
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
        navigate('/settings');
    });

    document.getElementById('setlists-btn').addEventListener('click', () => {
        showSetlistsModal();
    });

    document.getElementById('logout-btn').addEventListener('click', logout);

    // Load scores
    await loadScores();
}

/**
 * Load scores from database
 */
async function loadScores() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            scores = [];
            renderScoresList();
            return;
        }

        const { data, error } = await supabase
            .from('scores')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        scores = data || [];
        renderScoresList();
    } catch (error) {
        console.error('Failed to load scores:', error);
        showToast('Failed to load scores', 'error');
    }
}

/**
 * Render the filtered/sorted scores list
 */
function renderScoresList() {
    const container = document.getElementById('scores-container');

    // Filter scores
    let filtered = scores.filter(score => {
        // Type filter
        if (filterType !== 'all') {
            if (filterType === 'musicxml' && score.file_type !== 'musicxml' && score.file_type !== 'mxl') {
                return false;
            }
            if (filterType === 'pdf' && score.file_type !== 'pdf') {
                return false;
            }
        }

        // Favorites filter
        if (showFavoritesOnly && !score.is_favorite) {
            return false;
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const titleMatch = score.title.toLowerCase().includes(query);
            const composerMatch = score.composer?.toLowerCase().includes(query);
            const tagsMatch = score.tags?.some(t => t.toLowerCase().includes(query));
            if (!titleMatch && !composerMatch && !tagsMatch) {
                return false;
            }
        }

        return true;
    });

    // Sort scores
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'recent':
                const aDate = a.last_opened_at || a.created_at;
                const bDate = b.last_opened_at || b.created_at;
                return new Date(bDate) - new Date(aDate);
            case 'created':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'title':
                return a.title.localeCompare(b.title);
            default:
                return 0;
        }
    });

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        ${scores.length === 0 ? `
          <div class="empty-icon">📄</div>
          <h2>No scores yet</h2>
          <p>Upload your first sheet music to get started!</p>
          <button class="btn btn-primary" id="empty-upload-btn">Upload Score</button>
        ` : `
          <div class="empty-icon">🔍</div>
          <h2>No matching scores</h2>
          <p>Try adjusting your search or filters</p>
        `}
      </div>
    `;

        const emptyBtn = document.getElementById('empty-upload-btn');
        if (emptyBtn) {
            emptyBtn.addEventListener('click', () => showUploadModal(() => loadScores()));
        }
        return;
    }

    // Split into sections
    const favorites = filtered.filter(s => s.is_favorite);
    const recent = filtered.filter(s => s.last_opened_at && !s.is_favorite).slice(0, 5);
    const recentIds = new Set(recent.map(s => s.id));
    const others = filtered.filter(s => !s.is_favorite && !recentIds.has(s.id));

    let html = '';

    // Favorites section
    if (favorites.length > 0 && !showFavoritesOnly) {
        html += `
      <div class="scores-section">
        <h2 class="section-title">⭐ Favorites</h2>
        <div class="scores-row">
          ${favorites.map(renderScoreCard).join('')}
        </div>
      </div>
    `;
    }

    // Recently opened section (only if not searching or filtering)
    if (recent.length > 0 && !searchQuery && filterType === 'all' && !showFavoritesOnly) {
        html += `
      <div class="scores-section">
        <h2 class="section-title">🕐 Recently Opened</h2>
        <div class="scores-row">
          ${recent.map(renderScoreCard).join('')}
        </div>
      </div>
    `;
    }

    // All scores / filtered results
    const allScores = showFavoritesOnly ? favorites : (searchQuery || filterType !== 'all' ? filtered : others);
    if (allScores.length > 0 || showFavoritesOnly) {
        const title = showFavoritesOnly ? '' : (searchQuery ? 'Search Results' : 'All Scores');
        html += `
      <div class="scores-section">
        ${title ? `<h2 class="section-title">${title}</h2>` : ''}
        <div class="scores-grid-items">
          ${allScores.map(renderScoreCard).join('')}
        </div>
      </div>
    `;
    }

    container.innerHTML = html;

    // Attach event listeners to score cards
    container.querySelectorAll('.score-card').forEach(card => {
        const scoreId = card.dataset.scoreId;

        card.querySelector('.score-open').addEventListener('click', () => openScore(scoreId));
        card.querySelector('.score-favorite').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(scoreId);
        });
        card.querySelector('.score-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteScore(scoreId);
        });
    });
}

/**
 * Render a single score card
 * @param {Object} score - Score object
 * @returns {string} HTML string
 */
function renderScoreCard(score) {
    const typeIcon = score.file_type === 'pdf' ? '📕' : '🎼';
    const hasPosition = score.last_position && (
        score.last_position.pdfPage > 1 ||
        score.last_position.scrollTop > 100 ||
        score.last_position.pageIndex > 0
    );

    return `
    <div class="score-card" data-score-id="${score.id}">
      <div class="score-type-badge">${typeIcon}</div>
      <div class="score-info">
        <h3 class="score-title">${escapeHtml(score.title)}</h3>
        ${score.composer ? `<p class="score-composer">${escapeHtml(score.composer)}</p>` : ''}
        ${score.tags?.length ? `
          <div class="score-tags">
            ${score.tags.slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
        <p class="score-meta">
          ${score.last_opened_at ? `Last opened ${formatDate(score.last_opened_at)}` : `Added ${formatDate(score.created_at)}`}
        </p>
      </div>
      <div class="score-actions">
        <button class="score-open btn btn-primary btn-sm">
          ${hasPosition ? '▶ Continue' : 'Open'}
        </button>
        <button class="score-favorite btn btn-ghost btn-sm" title="${score.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">
          ${score.is_favorite ? '⭐' : '☆'}
        </button>
        <button class="score-delete btn btn-ghost btn-sm" title="Delete score">
          🗑️
        </button>
      </div>
    </div>
  `;
}

/**
 * Open a score in the viewer
 * @param {string} scoreId - Score ID
 */
async function openScore(scoreId) {
    // Update last_opened_at
    try {
        const user = await getCurrentUser();
        if (!user) return;

        await supabase
            .from('scores')
            .update({ last_opened_at: new Date().toISOString() })
            .eq('id', scoreId)
            .eq('user_id', user.id);
    } catch (error) {
        console.warn('Failed to update last opened:', error);
    }

    navigate(`/viewer/${scoreId}`);
}

/**
 * Toggle favorite status
 * @param {string} scoreId - Score ID
 */
async function toggleFavorite(scoreId) {
    const score = scores.find(s => s.id === scoreId);
    if (!score) return;

    const newValue = !score.is_favorite;

    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { error } = await supabase
            .from('scores')
            .update({ is_favorite: newValue })
            .eq('id', scoreId)
            .eq('user_id', user.id);

        if (error) throw error;

        score.is_favorite = newValue;
        renderScoresList();
        showToast(newValue ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (error) {
        console.error('Failed to toggle favorite:', error);
        showToast('Failed to update favorite', 'error');
    }
}

/**
 * Delete a score
 * @param {string} scoreId - Score ID
 */
async function deleteScore(scoreId) {
    const score = scores.find(s => s.id === scoreId);
    if (!score) return;

    const confirmed = await showConfirm(
        'Delete Score',
        `Are you sure you want to delete "${score.title}"? This cannot be undone.`,
        'Delete',
        'Cancel'
    );

    if (!confirmed) return;

    try {
        const user = await getCurrentUser();
        if (!user) return;

        // Delete from storage first
        await deleteFile(score.storage_bucket, score.storage_path);

        // Delete from database
        const { error } = await supabase
            .from('scores')
            .delete()
            .eq('id', scoreId)
            .eq('user_id', user.id);

        if (error) throw error;

        scores = scores.filter(s => s.id !== scoreId);
        renderScoresList();
        showToast('Score deleted', 'success');
    } catch (error) {
        console.error('Failed to delete score:', error);
        showToast('Failed to delete score', 'error');
    }
}
