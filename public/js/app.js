// ============================================================
// AI Agent Hub — Landing Page Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Staggered entrance animation for cards
    const cards = document.querySelectorAll('.agent-card');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(24px)';
        card.style.transition = `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`;
        requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });
    });
});
