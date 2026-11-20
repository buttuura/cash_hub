import { useEffect, useRef } from 'react';

const AdminTableFloatingScrollbar = () => {
  const scrollbarRef = useRef(null);
  const spacerRef = useRef(null);
  const activeTableRef = useRef(null);

  useEffect(() => {
    const scrollbar = scrollbarRef.current;
    const spacer = spacerRef.current;
    if (!scrollbar || !spacer) return undefined;

    let updateFrame = 0;
    let resizeObserver;

    const setActiveTable = (table) => {
      if (activeTableRef.current === table) return;
      if (resizeObserver && activeTableRef.current) {
        resizeObserver.unobserve(activeTableRef.current);
      }
      activeTableRef.current = table;
      if (resizeObserver && table) resizeObserver.observe(table);
    };

    const syncScrollbarToTable = (table) => {
      if (!table || table.scrollWidth <= table.clientWidth) {
        scrollbar.hidden = true;
        spacer.style.width = '0px';
        return;
      }

      const maxScrollLeft = table.scrollWidth - table.clientWidth;
      scrollbar.hidden = false;
      spacer.style.width = `${maxScrollLeft + scrollbar.clientWidth}px`;
      scrollbar.scrollLeft = Math.min(table.scrollLeft, maxScrollLeft);
    };

    const updateActiveTable = () => {
      const viewportHeight = window.innerHeight;
      let nextTable = null;
      let greatestVisibleHeight = 0;

      document.querySelectorAll('.admin-table-scroll').forEach((container) => {
        if (!container.querySelector('table')) return;

        const bounds = container.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0),
        );

        if (
          visibleHeight > greatestVisibleHeight
          && container.scrollWidth > container.clientWidth
        ) {
          greatestVisibleHeight = visibleHeight;
          nextTable = container;
        }
      });

      setActiveTable(nextTable);
      syncScrollbarToTable(nextTable);
    };

    const scheduleUpdate = () => {
      if (updateFrame) return;
      updateFrame = window.requestAnimationFrame(() => {
        updateFrame = 0;
        updateActiveTable();
      });
    };

    const handleDocumentScroll = (event) => {
      if (event.target === scrollbar) return;

      if (event.target === activeTableRef.current) {
        scrollbar.scrollLeft = activeTableRef.current.scrollLeft;
        return;
      }

      if (
        event.target instanceof HTMLElement
        && event.target.classList.contains('admin-table-scroll')
        && event.target.querySelector('table')
      ) {
        const bounds = event.target.getBoundingClientRect();
        if (bounds.bottom > 0 && bounds.top < window.innerHeight) {
          setActiveTable(event.target);
          syncScrollbarToTable(event.target);
          return;
        }
      }

      scheduleUpdate();
    };

    const handleScrollbarScroll = () => {
      if (activeTableRef.current) {
        activeTableRef.current.scrollLeft = scrollbar.scrollLeft;
      }
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleUpdate);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('scroll', handleDocumentScroll, true);
    window.addEventListener('resize', scheduleUpdate);
    scrollbar.addEventListener('scroll', handleScrollbarScroll, { passive: true });
    scheduleUpdate();

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('scroll', handleDocumentScroll, true);
      window.removeEventListener('resize', scheduleUpdate);
      scrollbar.removeEventListener('scroll', handleScrollbarScroll);
      if (updateFrame) window.cancelAnimationFrame(updateFrame);
    };
  }, []);

  return (
    <div
      ref={scrollbarRef}
      className="admin-table-floating-scrollbar"
      role="region"
      aria-label="Scroll the visible table horizontally"
      tabIndex={0}
      hidden
    >
      <div ref={spacerRef} aria-hidden="true" />
    </div>
  );
};

export default AdminTableFloatingScrollbar;
