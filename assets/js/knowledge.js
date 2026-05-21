// =========================================================
// File: assets/js/knowledge.js
// Helper interactions for the knowledge section
// =========================================================

(() => {
    document.addEventListener('DOMContentLoaded', () => {
        enhanceKnowledgeMenu();
    });

    function enhanceKnowledgeMenu() {
        const cards = document.querySelectorAll('[data-knowledge-card]');
        if (!cards.length) {
            return;
        }

        cards.forEach((card) => {
            card.addEventListener('focus', () => card.classList.add('is-focused')); 
            card.addEventListener('blur', () => card.classList.remove('is-focused'));
        });
    }
})();
