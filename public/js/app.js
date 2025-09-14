// app.js (final)
document.addEventListener('alpine:init', () => {
  Alpine.data('main', () => ({
    // reactive state
    searchQuery: '',
    tempSearchQuery: '',
    selectedFilter: 'all',
    selectedFilterSearch: 'all',
    selectedSort: 'terbaru',
    selectedSortSearch: 'terbaru',

    visibleCountMain: 10,
    visibleCountSearch: 10,
    increment: 10,

    sortOpen: false,
    sortOpenSmall: false,
    searchOpen: false,

    typing: false,
    typingTimer: null,
    typingDebounceMs: 500,

    // data will be filled from API
    data: [],

    // caching helpers
    _cachedFilteredKey: null,
    _cachedFilteredResult: null,
    _cachedSearchKey: null,
    _cachedSearchResult: null,

    /* labels */
    get selectedSortLabel() {
      if (this.selectedSort === 'terbaru') return 'Terbaru';
      if (this.selectedSort === 'terlama') return 'Terlama';
      if (this.selectedSort === 'a-z') return 'A - Z';
      return this.selectedSort;
    },

    get selectedSortLabelSmall() {
      if (this.selectedSortSearch === 'terbaru') return 'Terbaru';
      if (this.selectedSortSearch === 'terlama') return 'Terlama';
      if (this.selectedSortSearch === 'a-z') return 'A - Z';
      return this.selectedSortSearch;
    },

    /* main actions */
    setFilter(filter) {
      this.selectedFilter = filter;
      this.visibleCountMain = 10;
      this._cachedFilteredKey = null;
      this._cachedFilteredResult = null;
    },

    setSort(sort) {
      this.selectedSort = sort;
      this.visibleCountMain = 10;
      this.sortOpenSmall = false;
      this.sortOpen = false;
      this._cachedFilteredKey = null;
      this._cachedFilteredResult = null;
    },

    /* search panel actions */
    setFilterSearch(filter) {
      this.selectedFilterSearch = filter;
      this.visibleCountSearch = 10;
      this._cachedSearchKey = null;
      this._cachedSearchResult = null;
    },

    setSortSearch(sort) {
      this.selectedSortSearch = sort;
      this.visibleCountSearch = 10;
      this.sortOpenSmall = false;
      this._cachedSearchKey = null;
      this._cachedSearchResult = null;
    },

    loadMoreMain() { this.visibleCountMain += this.increment; },
    loadMoreSearch() { this.visibleCountSearch += this.increment; },

    onSearchFocus() {
      this.searchOpen = true;
    },

    onTyping() {
      if (!this.searchOpen) this.searchOpen = true;
      this.typing = true;
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        this.typing = false;
        this.typingTimer = null;
      }, this.typingDebounceMs);
    },

    /* search results (memoized) */
    get filteredDataForSearchAll() {
      const q = (this.tempSearchQuery || '').toLowerCase().trim();
      const key = `${q}|${this.selectedFilterSearch}|${this.selectedSortSearch}`;

      if (this._cachedSearchKey === key && this._cachedSearchResult) return this._cachedSearchResult;

      let results = this.data.slice();

      // filter by availability if present
      if (this.selectedFilterSearch === 'available') results = results.filter(i => i.status === true);
      else if (this.selectedFilterSearch === 'sold') results = results.filter(i => i.status === false);

      // search
      if (q && q.length > 0) {
        results = results.filter(item => item._nameLower.includes(q));
      }

      // sort
      if (this.selectedSortSearch === 'terlama') results = results.slice().reverse();
      else if (this.selectedSortSearch === 'a-z') results = results.slice().sort((a,b) => a._nameLower.localeCompare(b._nameLower));

      this._cachedSearchKey = key;
      this._cachedSearchResult = results;
      return results;
    },

    get filteredDataForSearch() {
      const q = (this.tempSearchQuery || '').toLowerCase().trim();
      if (this.searchOpen && q === '') {
        return this.filteredDataForSearchAll.slice(0, this.visibleCountSearch);
      }
      return this.filteredDataForSearchAll;
    },

    /* main filtered data (memoized) */
    get filteredData() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      const key = `${q}|${this.selectedFilter}|${this.selectedSort}`;

      if (this._cachedFilteredKey === key && this._cachedFilteredResult) return this._cachedFilteredResult;

      let results = this.data.slice();

      if (q) results = results.filter(item => item._nameLower.includes(q));
      if (this.selectedFilter === 'available') results = results.filter(i => i.status === true);
      else if (this.selectedFilter === 'sold') results = results.filter(i => i.status === false);

      if (this.selectedSort === 'terlama') results = results.slice().reverse();
      else if (this.selectedSort === 'a-z') results = results.slice().sort((a,b) => a._nameLower.localeCompare(b._nameLower));

      this._cachedFilteredKey = key;
      this._cachedFilteredResult = results;
      return results;
    },

    get visibleData() { return this.filteredData.slice(0, this.visibleCountMain); },
    get filteredLength() { return this.filteredData.length; },

    /* lifecycle: init called from x-init="init()" on body */
    async init() {
      console.log('[app] init() called');
      await this.fetchFromApi();

      // preprocess names to lowercase for faster searches
      this.data = this.data.map(item => ({ ...item, _nameLower: (item.namaAkun || '').toLowerCase() }));

      // reset caches so UI shows "All" immediately after load
      this._cachedFilteredKey = null;
      this._cachedFilteredResult = null;
      this._cachedSearchKey = null;
      this._cachedSearchResult = null;

      // watchers to invalidate caches
      if (this.$watch) {
        this.$watch('searchQuery', () => {
          this._cachedFilteredKey = null;
          this._cachedFilteredResult = null;
        });
        this.$watch('tempSearchQuery', () => {
          this._cachedSearchKey = null;
          this._cachedSearchResult = null;
        });
        this.$watch('selectedFilter', () => {
          this._cachedFilteredKey = null;
          this._cachedFilteredResult = null;
        });
        this.$watch('selectedSort', () => {
          this._cachedFilteredKey = null;
          this._cachedFilteredResult = null;
        });
        this.$watch('selectedFilterSearch', () => {
          this._cachedSearchKey = null;
          this._cachedSearchResult = null;
        });
        this.$watch('selectedSortSearch', () => {
          this._cachedSearchKey = null;
          this._cachedSearchResult = null;
        });
      }
    },

    // fetch data from backend
    async fetchFromApi() {
      try {
        // By default use same-origin API path.
        // If your API is on a different host/port, replace this with full URL:
        // e.g. const API = 'http://localhost:2121/api/ranzirostore_akunml';
        const API = `https://ranziro-server-production.up.railway.app/api/ranzirostore_akunml`;
        // For dev override you can uncomment next line:
        // const API = 'http://localhost:2121/api/ranzirostore_akunml';
        console.log('[app] fetching data from', API);

        const res = await fetch(API, { credentials: 'include' });
        console.log('[app] HTTP status', res.status, res.statusText);

        const json = await res.json();
        console.log('[app] API response', json);

        if (!json || !json.success) {
          console.error('[app] fetchFromApi error:', (json && json.message) || json);
          this.data = [];
          // reset caches anyway
          this._cachedFilteredKey = null;
          this._cachedFilteredResult = null;
          this._cachedSearchKey = null;
          this._cachedSearchResult = null;
          return;
        }

        // map DB result into shape used by UI
        this.data = (json.data || []).map(item => {
          // gambars may be array (jsonb) or stringified JSON
          let arr = [];
          if (Array.isArray(item.gambars)) arr = item.gambars;
          else if (typeof item.gambars === 'string' && item.gambars.length) {
            try { arr = JSON.parse(item.gambars); } catch(e) { arr = []; }
          } else arr = [];

          const firstImg = (arr && arr.length) ? arr[0] : (item.gambar || '');

          // format harga
          let hargaFormatted = '';
          try {
            const n = Number(item.harga || 0);
            hargaFormatted = 'Rp ' + n.toLocaleString('id-ID');
          } catch (e) {
            hargaFormatted = item.harga || '';
          }

          // normalize status (accept boolean, string, number)
          let normalizedStatus = true;
          if (typeof item.status === 'boolean') normalizedStatus = item.status;
          else if (typeof item.status === 'string') {
            const s = item.status.toLowerCase();
            normalizedStatus = (s === 'available' || s === 'true' || s === '1') ? true : false;
          } else if (typeof item.status === 'number') {
            normalizedStatus = item.status === 1;
          } else normalizedStatus = Boolean(item.status);

          return {
            id: item.id,
            namaAkun: item.nama || '',
            hargaAkun: hargaFormatted,
            imgAkun: firstImg || 'logo/meta_ranziro.webp',
            status: normalizedStatus,
            __raw: item
          };
        });

        // reset caches so computed getters recalc with new data
        this._cachedFilteredKey = null;
        this._cachedFilteredResult = null;
        this._cachedSearchKey = null;
        this._cachedSearchResult = null;

      } catch (err) {
        console.error('[app] fetchFromApi network error', err);
        this.data = [];

        // reset caches in error case as well
        this._cachedFilteredKey = null;
        this._cachedFilteredResult = null;
        this._cachedSearchKey = null;
        this._cachedSearchResult = null;
      }
    },

    // manual refresh helper (can be called from UI)
    async refresh() {
      await this.fetchFromApi();
      this.data = this.data.map(item => ({ ...item, _nameLower: (item.namaAkun || '').toLowerCase() }));
      this._cachedFilteredKey = null;
      this._cachedFilteredResult = null;
      this._cachedSearchKey = null;
      this._cachedSearchResult = null;
    }

  }));
});