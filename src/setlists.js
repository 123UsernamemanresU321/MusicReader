/**
 * Setlists Module
 * Create and manage setlists of scores
 */

import { supabase, getCurrentUser } from './supabaseClient.js';
import { navigate } from './router.js';
import { showToast, showConfirm, escapeHtml } from './utils.js';

// State
let setlists = [];
let currentSetlist = null;
let setlistScores = [];
let availableScores = [];

/**
 * Show the setlists modal
 */
export async function showSetlistsModal() {
    const container = document.getElementById('modal-container');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'setlists-modal';
    modal.innerHTML = `
    <div class="modal modal-large">
      <div class="modal-header">
        <h2>Setlists</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>
      
      <div id="setlists-content" class="setlists-content">
        <div class="loading-message">Loading setlists...</div>
      </div>
    </div>
  `;

    container.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Load setlists
    await loadSetlists();
    renderSetlistsList(modal);
}

/**
 * Load all setlists for current user
 */
async function loadSetlists() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('setlists')
            .select('*, setlist_items(count)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        setlists = data || [];
    } catch (error) {
        console.error('Failed to load setlists:', error);
        showToast('Failed to load setlists', 'error');
    }
}

/**
 * Load available scores for adding to setlist
 */
async function loadAvailableScores() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('scores')
            .select('id, title, composer')
            .eq('user_id', user.id)
            .order('title');

        if (error) throw error;

        availableScores = data || [];
    } catch (error) {
        console.error('Failed to load scores:', error);
    }
}

/**
 * Load items for a specific setlist
 * @param {string} setlistId - Setlist ID
 */
async function loadSetlistItems(setlistId) {
    try {
        const { data, error } = await supabase
            .from('setlist_items')
            .select(`
        id,
        sort_order,
        score:scores(id, title, composer, file_type)
      `)
            .eq('setlist_id', setlistId)
            .order('sort_order');

        if (error) throw error;

        setlistScores = data || [];
    } catch (error) {
        console.error('Failed to load setlist items:', error);
        showToast('Failed to load setlist items', 'error');
    }
}

/**
 * Render the setlists list view
 * @param {HTMLElement} modal - Modal element
 */
function renderSetlistsList(modal) {
    const content = modal.querySelector('#setlists-content');

    if (setlists.length === 0) {
        content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No Setlists Yet</h3>
        <p>Create a setlist to organize scores for your performance</p>
        <button class="btn btn-primary" id="create-setlist-btn">
          + Create Setlist
        </button>
      </div>
    `;
    } else {
        content.innerHTML = `
      <div class="setlists-header">
        <button class="btn btn-primary" id="create-setlist-btn">
          + New Setlist
        </button>
      </div>
      <div class="setlists-list">
        ${setlists.map(setlist => `
          <div class="setlist-item" data-setlist-id="${setlist.id}">
            <div class="setlist-info">
              <h3 class="setlist-name">${escapeHtml(setlist.name)}</h3>
              <p class="setlist-count">${setlist.setlist_items?.[0]?.count || 0} scores</p>
            </div>
            <div class="setlist-actions">
              <button class="btn btn-primary btn-sm setlist-play" title="Play Setlist">
                ▶ Play
              </button>
              <button class="btn btn-ghost btn-sm setlist-edit" title="Edit">
                ✏️
              </button>
              <button class="btn btn-ghost btn-sm setlist-delete" title="Delete">
                🗑️
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

        // Event listeners for setlist items
        content.querySelectorAll('.setlist-item').forEach(item => {
            const setlistId = item.dataset.setlistId;

            item.querySelector('.setlist-play').addEventListener('click', () => {
                playSetlist(setlistId);
                modal.remove();
            });

            item.querySelector('.setlist-edit').addEventListener('click', async () => {
                currentSetlist = setlists.find(s => s.id === setlistId);
                await loadSetlistItems(setlistId);
                await loadAvailableScores();
                renderSetlistEditor(modal);
            });

            item.querySelector('.setlist-delete').addEventListener('click', async () => {
                await deleteSetlist(setlistId);
                renderSetlistsList(modal);
            });
        });
    }

    // Create setlist button
    content.querySelector('#create-setlist-btn')?.addEventListener('click', async () => {
        await createSetlist();
        renderSetlistsList(modal);
    });
}

/**
 * Render the setlist editor view
 * @param {HTMLElement} modal - Modal element
 */
function renderSetlistEditor(modal) {
    const content = modal.querySelector('#setlists-content');

    // Get scores not in setlist
    const setlistScoreIds = new Set(setlistScores.map(item => item.score?.id));
    const addableScores = availableScores.filter(s => !setlistScoreIds.has(s.id));

    content.innerHTML = `
    <div class="setlist-editor">
      <div class="editor-header">
        <button class="btn btn-ghost" id="back-to-list">← Back</button>
        <input 
          type="text" 
          id="setlist-name" 
          class="setlist-name-input"
          value="${escapeHtml(currentSetlist.name)}"
          placeholder="Setlist name"
        />
        <button class="btn btn-primary" id="save-setlist-name">Save</button>
      </div>
      
      <div class="editor-columns">
        <div class="editor-column">
          <h3>Setlist Order</h3>
          <p class="column-hint">Use arrows to reorder</p>
          
          ${setlistScores.length === 0 ? `
            <div class="empty-column">
              <p>No scores in this setlist yet</p>
            </div>
          ` : `
            <div class="setlist-items" id="setlist-items">
              ${setlistScores.map((item, index) => `
                <div class="setlist-score" data-item-id="${item.id}">
                  <span class="score-order">${index + 1}</span>
                  <div class="score-details">
                    <span class="score-title">${escapeHtml(item.score?.title || 'Unknown')}</span>
                    ${item.score?.composer ? `<span class="score-composer">${escapeHtml(item.score.composer)}</span>` : ''}
                  </div>
                  <div class="score-controls">
                    <button class="btn btn-ghost btn-sm move-up" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button class="btn btn-ghost btn-sm move-down" ${index === setlistScores.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="btn btn-ghost btn-sm remove-score">✕</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        
        <div class="editor-column">
          <h3>Add Scores</h3>
          <input 
            type="search" 
            id="add-score-search" 
            class="search-input"
            placeholder="Search scores..."
          />
          
          <div class="available-scores" id="available-scores">
            ${addableScores.length === 0 ? `
              <div class="empty-column">
                <p>No more scores to add</p>
              </div>
            ` : addableScores.map(score => `
              <div class="available-score" data-score-id="${score.id}">
                <div class="score-details">
                  <span class="score-title">${escapeHtml(score.title)}</span>
                  ${score.composer ? `<span class="score-composer">${escapeHtml(score.composer)}</span>` : ''}
                </div>
                <button class="btn btn-ghost btn-sm add-score">+ Add</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

    // Back button
    content.querySelector('#back-to-list').addEventListener('click', () => {
        currentSetlist = null;
        setlistScores = [];
        renderSetlistsList(modal);
    });

    // Save name
    content.querySelector('#save-setlist-name').addEventListener('click', async () => {
        const newName = content.querySelector('#setlist-name').value.trim();
        if (newName && newName !== currentSetlist.name) {
            await updateSetlistName(currentSetlist.id, newName);
        }
    });

    // Move up/down
    content.querySelectorAll('.move-up').forEach(btn => {
        btn.addEventListener('click', async () => {
            const itemId = btn.closest('.setlist-score').dataset.itemId;
            await moveItem(itemId, -1);
            renderSetlistEditor(modal);
        });
    });

    content.querySelectorAll('.move-down').forEach(btn => {
        btn.addEventListener('click', async () => {
            const itemId = btn.closest('.setlist-score').dataset.itemId;
            await moveItem(itemId, 1);
            renderSetlistEditor(modal);
        });
    });

    // Remove score
    content.querySelectorAll('.remove-score').forEach(btn => {
        btn.addEventListener('click', async () => {
            const itemId = btn.closest('.setlist-score').dataset.itemId;
            await removeFromSetlist(itemId);
            renderSetlistEditor(modal);
        });
    });

    // Add score
    content.querySelectorAll('.add-score').forEach(btn => {
        btn.addEventListener('click', async () => {
            const scoreId = btn.closest('.available-score').dataset.scoreId;
            await addToSetlist(currentSetlist.id, scoreId);
            renderSetlistEditor(modal);
        });
    });

    // Search filter
    content.querySelector('#add-score-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        content.querySelectorAll('.available-score').forEach(el => {
            const title = el.querySelector('.score-title').textContent.toLowerCase();
            const composer = el.querySelector('.score-composer')?.textContent.toLowerCase() || '';
            el.style.display = (title.includes(query) || composer.includes(query)) ? '' : 'none';
        });
    });
}

/**
 * Create a new setlist
 */
async function createSetlist() {
    const name = prompt('Enter setlist name:');
    if (!name?.trim()) return;

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('setlists')
            .insert({
                user_id: user.id,
                name: name.trim()
            })
            .select()
            .single();

        if (error) throw error;

        setlists.unshift(data);
        showToast('Setlist created', 'success');
    } catch (error) {
        console.error('Failed to create setlist:', error);
        showToast('Failed to create setlist', 'error');
    }
}

/**
 * Update setlist name
 */
async function updateSetlistName(setlistId, newName) {
    try {
        const { error } = await supabase
            .from('setlists')
            .update({ name: newName })
            .eq('id', setlistId);

        if (error) throw error;

        currentSetlist.name = newName;
        const setlist = setlists.find(s => s.id === setlistId);
        if (setlist) setlist.name = newName;

        showToast('Setlist name updated', 'success');
    } catch (error) {
        console.error('Failed to update setlist name:', error);
        showToast('Failed to update name', 'error');
    }
}

/**
 * Delete a setlist
 */
async function deleteSetlist(setlistId) {
    const setlist = setlists.find(s => s.id === setlistId);
    if (!setlist) return;

    const confirmed = await showConfirm(
        'Delete Setlist',
        `Are you sure you want to delete "${setlist.name}"?`,
        'Delete',
        'Cancel'
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('setlists')
            .delete()
            .eq('id', setlistId);

        if (error) throw error;

        setlists = setlists.filter(s => s.id !== setlistId);
        showToast('Setlist deleted', 'success');
    } catch (error) {
        console.error('Failed to delete setlist:', error);
        showToast('Failed to delete setlist', 'error');
    }
}

/**
 * Add a score to setlist
 */
async function addToSetlist(setlistId, scoreId) {
    try {
        const maxOrder = setlistScores.length > 0
            ? Math.max(...setlistScores.map(s => s.sort_order))
            : 0;

        const { data, error } = await supabase
            .from('setlist_items')
            .insert({
                setlist_id: setlistId,
                score_id: scoreId,
                sort_order: maxOrder + 1
            })
            .select(`
        id,
        sort_order,
        score:scores(id, title, composer, file_type)
      `)
            .single();

        if (error) throw error;

        setlistScores.push(data);
        showToast('Score added to setlist', 'success');
    } catch (error) {
        console.error('Failed to add to setlist:', error);
        showToast('Failed to add score', 'error');
    }
}

/**
 * Remove a score from setlist
 */
async function removeFromSetlist(itemId) {
    try {
        const { error } = await supabase
            .from('setlist_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        setlistScores = setlistScores.filter(s => s.id !== itemId);

        // Reorder remaining items
        await reorderItems();

        showToast('Score removed from setlist', 'success');
    } catch (error) {
        console.error('Failed to remove from setlist:', error);
        showToast('Failed to remove score', 'error');
    }
}

/**
 * Move an item up or down
 */
async function moveItem(itemId, direction) {
    const index = setlistScores.findIndex(s => s.id === itemId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= setlistScores.length) return;

    // Swap items in array
    [setlistScores[index], setlistScores[newIndex]] = [setlistScores[newIndex], setlistScores[index]];

    // Update sort orders
    await reorderItems();
}

/**
 * Reorder all items (update sort_order in DB)
 */
async function reorderItems() {
    try {
        const updates = setlistScores.map((item, index) => ({
            id: item.id,
            sort_order: index + 1,
            setlist_id: currentSetlist.id,
            score_id: item.score?.id
        }));

        const { error } = await supabase
            .from('setlist_items')
            .upsert(updates);

        if (error) throw error;

        // Update local state
        setlistScores.forEach((item, index) => {
            item.sort_order = index + 1;
        });
    } catch (error) {
        console.error('Failed to reorder items:', error);
        showToast('Failed to reorder', 'error');
    }
}

/**
 * Start playing a setlist
 */
async function playSetlist(setlistId) {
    try {
        // Load setlist items
        const { data: items, error } = await supabase
            .from('setlist_items')
            .select('score_id, sort_order')
            .eq('setlist_id', setlistId)
            .order('sort_order');

        if (error) throw error;

        if (!items || items.length === 0) {
            showToast('This setlist is empty', 'warning');
            return;
        }

        // Navigate to first score in setlist mode
        const firstScore = items[0];
        navigate(`/viewer/${firstScore.score_id}/setlist/${setlistId}/0`);
    } catch (error) {
        console.error('Failed to play setlist:', error);
        showToast('Failed to play setlist', 'error');
    }
}
