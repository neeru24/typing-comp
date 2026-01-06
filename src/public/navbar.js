/**
 * TechFest Typing - Navbar Controller
 * Handles mobile menu toggle, scroll effects, and user state
 */

(function() {
  'use strict';

  // DOM Elements
  const navbar = document.getElementById('navbar');
  const navbarToggle = document.getElementById('navbarToggle');
  const navbarNav = document.getElementById('navbarNav');

  // Mobile Menu Toggle
  if (navbarToggle && navbarNav) {
    navbarToggle.addEventListener('click', function() {
      navbarToggle.classList.toggle('active');
      navbarNav.classList.toggle('active');
    });

    // Close menu when clicking on a nav link (mobile)
    navbarNav.querySelectorAll('.nav-link, .nav-cta').forEach(link => {
      link.addEventListener('click', () => {
        navbarToggle.classList.remove('active');
        navbarNav.classList.remove('active');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
      const isClickInside = navbar.contains(event.target);
      if (!isClickInside && navbarNav.classList.contains('active')) {
        navbarToggle.classList.remove('active');
        navbarNav.classList.remove('active');
      }
    });
  }

  // Scroll Effect - Add shadow and compact navbar on scroll
  let lastScroll = 0;
  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;
    
    if (navbar) {
      if (currentScroll > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
    
    lastScroll = currentScroll;
  });

  // Handle page-specific active state
  function setActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      
      if (href === currentPath || 
          (href === '/' && (currentPath === '' || currentPath === '/participant.html')) ||
          (href === '/organizer' && currentPath.includes('organizer')) ||
          (href === '/analytics' && currentPath.includes('analytics'))) {
        link.classList.add('active');
      }
    });
  }

  // Initialize
  setActiveNavLink();
})();
