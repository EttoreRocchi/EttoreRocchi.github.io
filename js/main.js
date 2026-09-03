/* ============================================
   Ettore Rocchi - Site JavaScript
   No frameworks. Vanilla JS only.

   All content is pre-rendered at build time (see scripts/build_site.py);
   this file only adds behaviour on top of the static HTML: theme toggle,
   mobile nav, reveal animations, publication filters and BibTeX helpers.
   ============================================ */

(function () {
  'use strict';

  var html = document.documentElement;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ============================================================
  // Dark Mode Toggle
  // ============================================================
  var themeToggle = document.querySelector('.theme-toggle');

  function syncThemeToggle() {
    if (!themeToggle) return;
    var isDark = html.getAttribute('data-theme') === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode etc. */ }
    syncThemeToggle();
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
    syncThemeToggle();
  }

  // Follow OS changes as long as the visitor has not picked a theme explicitly.
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkQuery.addEventListener) {
    darkQuery.addEventListener('change', function (e) {
      var saved = null;
      try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
      if (saved) return;
      if (e.matches) html.setAttribute('data-theme', 'dark');
      else html.removeAttribute('data-theme');
      syncThemeToggle();
    });
  }

  // ============================================================
  // Mobile Navigation
  // ============================================================
  var hamburger = document.querySelector('.nav-hamburger');
  var navMenu = document.querySelector('.nav-menu');
  var navLinks = document.querySelectorAll('.nav-links a');

  function closeMenu() {
    if (!navMenu || !navMenu.classList.contains('open')) return;
    navMenu.classList.remove('open');
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('open');
      hamburger.classList.toggle('active', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        closeMenu();
        hamburger.focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (!navMenu.classList.contains('open')) return;
      if (navMenu.contains(e.target) || hamburger.contains(e.target)) return;
      closeMenu();
    });
  }

  // ============================================================
  // Scroll-triggered reveal (fade-in + fade-in-stagger)
  // ============================================================
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

  // News items are pre-rendered; just play the staggered reveal.
  var newsItems = document.querySelectorAll('.news-item');
  if (newsItems.length) {
    requestAnimationFrame(function () {
      newsItems.forEach(function (el) { el.classList.add('news-item-visible'); });
    });
  }

  // ============================================================
  // Active Nav Highlighting (home page only, scroll-spy)
  // ============================================================
  var page = document.body.getAttribute('data-page');
  if (page === 'home') {
    var sections = document.querySelectorAll('section[id]');
    var sectionIds = ['about', 'news', 'highlights', 'contact'];

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

  // ============================================================
  // Animated <details> - smooth height transitions
  // Hijacks click on <summary> to animate open/close. Falls back
  // to native behaviour if reduced motion is preferred.
  // ============================================================
  function initAnimatedDetails(detailsEl) {
    var summary = detailsEl.querySelector(':scope > summary');
    var content = detailsEl.querySelector(':scope > :not(summary)');
    if (!summary || !content) return;

    summary.addEventListener('click', function (e) {
      if (prefersReducedMotion) return; // native behaviour
      e.preventDefault();

      if (detailsEl.classList.contains('is-animating')) return; // ignore during transition

      var isOpen = detailsEl.open;
      detailsEl.classList.add('is-animating');

      if (isOpen) {
        // CLOSING: measure current height, then animate to 0
        var currentHeight = content.offsetHeight;
        content.style.height = currentHeight + 'px';
        content.style.opacity = '1';
        // Force reflow before transition
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        requestAnimationFrame(function () {
          content.style.height = '0px';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function onEnd() {
          content.removeEventListener('transitionend', onEnd);
          detailsEl.open = false;
          detailsEl.classList.remove('is-animating');
          content.style.height = '';
          content.style.opacity = '';
        }, { once: true });
      } else {
        // OPENING: set open, measure target height, animate from 0
        detailsEl.open = true;
        var targetHeight = content.offsetHeight;
        content.style.height = '0px';
        content.style.opacity = '0';
        // Force reflow
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        requestAnimationFrame(function () {
          content.style.height = targetHeight + 'px';
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function onEnd() {
          content.removeEventListener('transitionend', onEnd);
          detailsEl.classList.remove('is-animating');
          content.style.height = '';
          content.style.opacity = '';
        }, { once: true });
      }
    });
  }

  document.querySelectorAll('details.bibtex-toggle').forEach(initAnimatedDetails);

  // ============================================================
  // BibTeX helpers
  // ============================================================

  // The BibTeX source is the text of .bibtex-code minus the copy button.
  function bibtexSource(codeEl) {
    var text = '';
    Array.prototype.forEach.call(codeEl.childNodes, function (node) {
      if (node.nodeType === 3) text += node.textContent;
    });
    return text.trim();
  }

  // Copy button (event delegation - no inline handlers, CSP-friendly)
  document.addEventListener('click', function (e) {
    var button = e.target.closest('.bibtex-copy');
    if (!button || !navigator.clipboard) return;
    var text = bibtexSource(button.parentElement);
    navigator.clipboard.writeText(text).then(function () {
      button.textContent = 'copied';
      button.classList.add('is-copied');
      setTimeout(function () {
        button.textContent = 'copy';
        button.classList.remove('is-copied');
      }, 2000);
    }).catch(function () {
      button.textContent = 'failed';
      setTimeout(function () { button.textContent = 'copy'; }, 2000);
    });
  });

  // ============================================================
  // Publications: text search + type/year facets + .bib export.
  // Everything operates on the pre-rendered list.
  // ============================================================
  var pubListContainer = document.getElementById('pub-list');
  var pubSearch = document.getElementById('pubSearch');

  if (pubListContainer && pubSearch) {
    initPublicationsFilter();
  }

  function initPublicationsFilter() {
    var pubSearchClear = document.getElementById('pubSearchClear');
    var pubSearchMeta = document.getElementById('pubSearchMeta');
    var pubEmpty = document.getElementById('pubEmpty');
    var pubEmptyQuery = document.getElementById('pubEmptyQuery');
    var pubEmptyClear = document.getElementById('pubEmptyClear');
    var pubBibDownload = document.getElementById('pubBibDownload');
    var pubBibCount = document.getElementById('pubBibCount');
    var pubTypeFilter = document.getElementById('pubTypeFilter');
    var pubYearFilter = document.getElementById('pubYearFilter');
    var currentTypeFilter = 'all';  // "all" = no type filter
    var currentYearFilter = 'all';  // "all" = no year filter

    var pubItems = pubListContainer.querySelectorAll('.pub-item');
    if (!pubItems.length) return;

    // Cache lowercase text content + bibtex source + facets for each item
    var pubIndex = Array.prototype.map.call(pubItems, function (item) {
      var bibEl = item.querySelector('.bibtex-code');
      return {
        el: item,
        text: item.textContent.toLowerCase(),
        bib: bibEl ? bibtexSource(bibEl) : '',
        type: item.getAttribute('data-type') || '',
        year: item.getAttribute('data-year') || ''
      };
    });

    function describeFilters(rawQuery) {
      var parts = [];
      if (rawQuery) parts.push('“' + rawQuery + '”');
      if (currentTypeFilter !== 'all') parts.push('type: ' + currentTypeFilter);
      if (currentYearFilter !== 'all') parts.push('year: ' + currentYearFilter);
      return parts.join(' + ');
    }

    function applyFilter(rawQuery) {
      var query = rawQuery.toLowerCase().trim();
      var visible = 0;

      pubIndex.forEach(function (entry) {
        var textMatch = !query || entry.text.indexOf(query) !== -1;
        var typeMatch = currentTypeFilter === 'all' || entry.type === currentTypeFilter;
        var yearMatch = currentYearFilter === 'all' || entry.year === currentYearFilter;
        var match = textMatch && typeMatch && yearMatch;
        entry.el.hidden = !match;
        if (match) visible++;
      });

      var anyFilterActive = !!query || currentTypeFilter !== 'all' || currentYearFilter !== 'all';

      // Empty state (shown whenever a filter is active and nothing matched)
      if (pubEmpty) {
        if (visible === 0 && anyFilterActive) {
          if (pubEmptyQuery) pubEmptyQuery.textContent = describeFilters(rawQuery.trim());
          pubEmpty.hidden = false;
        } else {
          pubEmpty.hidden = true;
        }
      }

      // Clear button on the search input (only relevant to the text query)
      if (pubSearchClear) {
        pubSearchClear.hidden = !query;
      }

      // Live status message
      if (pubSearchMeta) {
        pubSearchMeta.textContent = anyFilterActive
          ? visible + (visible === 1 ? ' match' : ' matches')
          : '';
      }

      // Sync the .bib download button with the current filter state
      if (pubBibDownload && pubBibCount) {
        pubBibCount.textContent = String(visible);
        var modeEl = pubBibDownload.querySelector('.pub-bib-mode');
        if (modeEl) modeEl.textContent = anyFilterActive ? 'filtered' : 'all';
        pubBibDownload.disabled = visible === 0;
        pubBibDownload.setAttribute(
          'title',
          anyFilterActive
            ? 'Download the ' + visible + ' filtered publication' + (visible === 1 ? '' : 's') + ' as a .bib file'
            : 'Download all publications as a single .bib file'
        );
      }
    }

    function setActivePill(containerEl, value) {
      if (!containerEl) return;
      containerEl.querySelectorAll('.pub-type-pill').forEach(function (b) {
        var isActive = (b.getAttribute('data-value') || 'all') === value;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
    }

    // Pill click handler shared by type + year facets.
    function attachFacet(containerEl, setter) {
      if (!containerEl) return;
      containerEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.pub-type-pill');
        if (!btn) return;
        var value = btn.getAttribute('data-value') || 'all';
        setActivePill(containerEl, value);
        setter(value);
        applyFilter(pubSearch.value || '');
      });
    }
    attachFacet(pubTypeFilter, function (v) { currentTypeFilter = v; });
    attachFacet(pubYearFilter, function (v) { currentYearFilter = v; });

    // .bib download: build content from currently visible entries and trigger save
    if (pubBibDownload) {
      pubBibDownload.addEventListener('click', function () {
        var visibleEntries = pubIndex.filter(function (e) { return !e.el.hidden && e.bib; });
        if (!visibleEntries.length) return;

        var query = (pubSearch.value || '').trim();
        var filters = describeFilters(query);
        var header = [
          '% BibTeX export - Ettore Rocchi',
          '% Generated client-side from the current filter on publications.html',
          filters
            ? '% Filter: ' + filters + ' - ' + visibleEntries.length + ' entries'
            : '% Full list - ' + visibleEntries.length + ' entries',
          '% Most recent first.',
          ''
        ].join('\n');

        var content = header + '\n' + visibleEntries.map(function (e) { return e.bib; }).join('\n\n') + '\n';
        var blob = new Blob([content], { type: 'application/x-bibtex' });
        var url = URL.createObjectURL(blob);
        var fname = filters
          ? 'ettore-rocchi-publications-filtered.bib'
          : 'ettore-rocchi-publications.bib';

        var a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }

    function resetAllFilters() {
      pubSearch.value = '';
      currentTypeFilter = 'all';
      currentYearFilter = 'all';
      setActivePill(pubTypeFilter, 'all');
      setActivePill(pubYearFilter, 'all');
      applyFilter('');
      pubSearch.focus();
    }

    pubSearch.addEventListener('input', function () {
      applyFilter(this.value);
    });

    if (pubSearchClear) {
      pubSearchClear.addEventListener('click', resetAllFilters);
    }

    if (pubEmptyClear) {
      pubEmptyClear.addEventListener('click', resetAllFilters);
    }

    // Sync UI state with the rendered data (bib count, mode, etc.)
    applyFilter('');

    // Keyboard shortcut: '/' focuses the search input
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== pubSearch && !e.ctrlKey && !e.metaKey) {
        var tag = (document.activeElement.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        pubSearch.focus();
      }
    });
  }

})();
