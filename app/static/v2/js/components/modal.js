/**
 * V2 modal.js - Modal controller
 */

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.v2-modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('v2-modal-overlay')) {
        e.target.classList.remove('open');
    }
});

window.openModal = openModal;
window.closeModal = closeModal;
