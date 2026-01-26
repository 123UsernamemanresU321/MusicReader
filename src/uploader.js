/**
 * Score Upload Module
 * Handles file upload with metadata and validation
 */

import { supabase, getCurrentUser, uploadFile } from './supabaseClient.js';
import { showToast, validateScoreFile, formatFileSize, getFileExtension } from './utils.js';

/**
 * Show the upload modal
 * @param {Function} onSuccess - Callback after successful upload
 */
export function showUploadModal(onSuccess) {
    const container = document.getElementById('modal-container');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'upload-modal';
    modal.innerHTML = `
    <div class="modal modal-large">
      <div class="modal-header">
        <h2>Upload Sheet Music</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>
      
      <form id="upload-form" class="upload-form">
        <div class="upload-dropzone" id="dropzone">
          <div class="dropzone-content">
            <span class="dropzone-icon">📄</span>
            <p class="dropzone-text">Drag & drop a file here or click to browse</p>
            <p class="dropzone-hint">Supported: PDF, MusicXML (.musicxml, .xml), MXL</p>
          </div>
          <input type="file" id="file-input" accept=".pdf,.musicxml,.xml,.mxl" hidden />
        </div>
        
        <div id="file-preview" class="file-preview" hidden>
          <div class="file-info">
            <span class="file-icon">📄</span>
            <div class="file-details">
              <span class="file-name"></span>
              <span class="file-size"></span>
            </div>
            <button type="button" class="file-remove" aria-label="Remove file">&times;</button>
          </div>
        </div>
        
        <div class="form-group">
          <label for="title">Title <span class="required">*</span></label>
          <input 
            type="text" 
            id="title" 
            name="title" 
            required 
            placeholder="e.g., Moonlight Sonata"
            maxlength="200"
          />
        </div>
        
        <div class="form-group">
          <label for="composer">Composer</label>
          <input 
            type="text" 
            id="composer" 
            name="composer" 
            placeholder="e.g., Ludwig van Beethoven"
            maxlength="100"
          />
        </div>
        
        <div class="form-group">
          <label for="tags">Tags</label>
          <input 
            type="text" 
            id="tags" 
            name="tags" 
            placeholder="e.g., classical, piano, sonata (comma separated)"
          />
          <small class="form-hint">Separate multiple tags with commas</small>
        </div>
        
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="upload-btn" disabled>
            Upload Score
          </button>
        </div>
        
        <div id="upload-progress" class="upload-progress" hidden>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <p class="progress-text">Uploading...</p>
        </div>
      </form>
    </div>
  `;

    container.appendChild(modal);

    // Elements
    const form = modal.querySelector('#upload-form');
    const dropzone = modal.querySelector('#dropzone');
    const fileInput = modal.querySelector('#file-input');
    const filePreview = modal.querySelector('#file-preview');
    const uploadBtn = modal.querySelector('#upload-btn');
    const titleInput = modal.querySelector('#title');

    let selectedFile = null;
    let fileType = null;

    // Close modal handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Dropzone click
    dropzone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag and drop handlers
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // File select handler
    function handleFileSelect(file) {
        const validation = validateScoreFile(file);
        if (!validation.valid) {
            showToast(validation.error, 'error');
            return;
        }

        selectedFile = file;
        fileType = validation.type;

        // Show preview
        filePreview.hidden = false;
        dropzone.hidden = true;
        filePreview.querySelector('.file-name').textContent = file.name;
        filePreview.querySelector('.file-size').textContent = formatFileSize(file.size);

        // Auto-fill title from filename if empty
        if (!titleInput.value) {
            const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
            titleInput.value = baseName;
        }

        updateUploadButton();
    }

    // Remove file
    filePreview.querySelector('.file-remove').addEventListener('click', () => {
        selectedFile = null;
        fileType = null;
        fileInput.value = '';
        filePreview.hidden = true;
        dropzone.hidden = false;
        updateUploadButton();
    });

    // Update upload button state
    function updateUploadButton() {
        uploadBtn.disabled = !selectedFile || !titleInput.value.trim();
    }

    titleInput.addEventListener('input', updateUploadButton);

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedFile) return;

        const title = titleInput.value.trim();
        const composer = form.composer.value.trim() || null;
        const tagsString = form.tags.value.trim();
        const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : [];

        // Show progress
        const progress = modal.querySelector('#upload-progress');
        progress.hidden = false;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';

        try {
            const user = await getCurrentUser();
            if (!user) throw new Error('Not authenticated');

            // Generate unique score ID
            const scoreId = crypto.randomUUID();
            const ext = getFileExtension(selectedFile.name);
            const storagePath = `${user.id}/${scoreId}/original.${ext}`;

            // Upload file
            const { data: uploadData, error: uploadError } = await uploadFile(
                'scores',
                storagePath,
                selectedFile
            );

            if (uploadError) throw uploadError;

            // Insert database record
            const { data: scoreData, error: scoreError } = await supabase
                .from('scores')
                .insert({
                    id: scoreId,
                    user_id: user.id,
                    title,
                    composer,
                    tags,
                    file_type: fileType,
                    storage_bucket: 'scores',
                    storage_path: storagePath
                })
                .select()
                .single();

            if (scoreError) throw scoreError;

            showToast('Score uploaded successfully!', 'success');
            closeModal();

            if (onSuccess) {
                onSuccess(scoreData);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Failed to upload score', 'error');
            progress.hidden = true;
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload Score';
        }
    });
}
