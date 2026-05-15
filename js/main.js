/* ============================================
   Ettore Rocchi - Site JavaScript
   ============================================ */

(function () {
  'use strict';

  var html = document.documentElement;

  // --- Dark Mode Toggle ---
  var themeToggle = document.querySelector('.theme-toggle');

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  if (!html.getAttribute('data-theme')) {
    setTheme('light');
  }

  // --- Mobile Navigation ---
  var hamburger = document.querySelector('.nav-hamburger');
  var navMenu = document.querySelector('.nav-menu');
  var navLinks = document.querySelectorAll('.nav-links a');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', isOpen);
    });

    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- Fade-in Animations (IntersectionObserver) ---
  var fadeElements = document.querySelectorAll('.fade-in, .fade-in-stagger');

  if ('IntersectionObserver' in window && fadeElements.length) {
    var fadeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(function (el) {
      fadeObserver.observe(el);
    });
  } else {
    fadeElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // --- Active Nav Highlighting (home page only, scroll-spy on sections) ---
  var page = document.body.getAttribute('data-page');
  if (page === 'home') {
    var sections = document.querySelectorAll('section[id]');
    var sectionIds = ['about', 'education', 'research', 'projects', 'publications', 'contact'];

    if ('IntersectionObserver' in window && sections.length) {
      var navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.getAttribute('id');
            if (sectionIds.indexOf(id) === -1) return;
            navLinks.forEach(function (link) {
              link.classList.remove('active');
              var navTarget = link.getAttribute('data-nav');
              if (navTarget === id) {
                link.classList.add('active');
              }
            });
          }
        });
      }, {
        threshold: 0.2,
        rootMargin: '-64px 0px -50% 0px'
      });

      sections.forEach(function (section) {
        navObserver.observe(section);
      });
    }
  }

  // --- Publications filter (publications.html) ---
  var pubFilters = document.querySelectorAll('.pub-filter');
  var pubItems = document.querySelectorAll('.pub-item[data-year]');
  var pubEmpty = document.querySelector('.pub-empty');

  if (pubFilters.length && pubItems.length) {
    pubFilters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = btn.getAttribute('data-filter');
        pubFilters.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var visibleCount = 0;
        pubItems.forEach(function (item) {
          var year = item.getAttribute('data-year');
          var match = filter === 'all' || year === filter;
          item.hidden = !match;
          if (match) visibleCount++;
        });

        if (pubEmpty) pubEmpty.hidden = visibleCount > 0;
      });
    });
  }

})();

// --- Copy BibTeX (global, used by onclick) ---
function copyBibtex(button) {
  var codeBlock = button.parentElement;
  var text = codeBlock.textContent.replace('copy', '').replace('copied', '').trim();
  navigator.clipboard.writeText(text).then(function () {
    button.textContent = 'copied';
    setTimeout(function () {
      button.textContent = 'copy';
    }, 2000);
  });
}
