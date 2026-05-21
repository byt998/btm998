(() => {
    const VEHICLE_TABLES = {
        '411-22': 'vehicle_411_22',
        '411-23': 'vehicle_411_23',
        '411-25': 'vehicle_411_25',
        '411-26': 'vehicle_411_26',
        '411-51': 'vehicle_411_51',
        '411-43': 'vehicle_411_43',
        '411-71': 'vehicle_411_71',
        '411-91': 'vehicle_411_91',
        '411-59': 'vehicle_411_59',
        '411-22-tyl': 'vehicle_411_22_tyl',
        '411-23-tyl': 'vehicle_411_23_tyl',
    };

    const selectors = {
        screens: '[data-commander-screen]',
        viewNav: '[data-commander-nav]',
        vehicleBody: '[data-vehicle-status-body]',
        vehicleEmpty: '[data-vehicle-status-empty]',
        vehicleLoading: '[data-vehicle-status-loading]',
        dutyBody: '[data-duty-summary-body]',
        dutyEmpty: '[data-duty-summary-empty]',
        dutyLoading: '[data-duty-summary-loading]',
        dutyMeta: '[data-duty-summary-meta]',
        refresh: '[data-action="refresh-issues"]',
    };

    const state = {
        supabase: null,
        user: null,
        profile: null,
        currentView: 'home',
        catalogMapById: new Map(),
        catalogMapByNameVehicle: new Map(),
        issuesByVehicle: new Map(),
        totals: [],
        issuesChannel: null,
        dutyChannel: null,
        refreshTimerId: null,
    };

    document.addEventListener('DOMContentLoaded', initModule);

    async function initModule() {
        state.supabase = window.AppCommon?.supabase || null;
        if (!state.supabase) {
            return;
        }

        setupCommanderShell();

        const { data } = await state.supabase.auth.getSession();
        state.user = data.session?.user || null;
        state.profile = window.AppCommon?.getCachedProfile?.() || null;
        if (!state.profile && state.user) {
            state.profile = await window.AppCommon?.refreshProfile?.(state.user);
        }

        document.querySelector(selectors.refresh)?.addEventListener('click', loadCommanderTables);
        setupRealtimeChannels();
        await loadCommanderTables();
    }

    function setupCommanderShell() {
        const navButtons = Array.from(document.querySelectorAll(selectors.viewNav));
        if (!navButtons.length) {
            return;
        }

        navButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.dataset.commanderNav || 'home';
                setCommanderView(target, true);
            });
        });

        window.addEventListener('hashchange', () => {
            setCommanderView(resolveViewFromHash(), false);
        });

        setCommanderView(resolveViewFromHash(), false);
    }

    function resolveViewFromHash() {
        const hash = window.location.hash.replace('#', '').trim();
        if (hash === 'status') {
            return hash;
        }
        return 'home';
    }

    function setCommanderView(view, updateHash) {
        state.currentView = view;

        document.querySelectorAll(selectors.screens).forEach((element) => {
            const screenName = element.dataset.commanderScreen || '';
            element.hidden = screenName !== view;
        });

        if (updateHash) {
            const nextHash = view === 'home' ? '' : `#${view}`;
            if (window.location.hash !== nextHash) {
                if (nextHash) {
                    window.location.hash = nextHash;
                } else {
                    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
                }
            }
        }
    }

    function setupRealtimeChannels() {
        if (!state.supabase) {
            return;
        }

        if (!state.issuesChannel) {
            state.issuesChannel = state.supabase
                .channel('commander-equipment-status')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_issue_status' }, scheduleRefresh)
                .subscribe();
        }

        if (!state.dutyChannel) {
            state.dutyChannel = state.supabase
                .channel('commander-duty-status')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_reports' }, scheduleRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_report_lines' }, scheduleRefresh)
                .subscribe();
        }
    }

    function scheduleRefresh() {
        if (state.refreshTimerId) {
            window.clearTimeout(state.refreshTimerId);
        }
        state.refreshTimerId = window.setTimeout(() => {
            state.refreshTimerId = null;
            loadCommanderTables();
        }, 150);
    }

    async function loadCommanderTables() {
        await Promise.all([
            loadVehiclesStatusTable(),
            loadDutySummaryTable(),
        ]);
    }

    async function ensureCatalogMap() {
        if (state.catalogMapById.size > 0 || state.catalogMapByNameVehicle.size > 0) {
            return;
        }

        await Promise.all(
            Object.entries(VEHICLE_TABLES).map(async ([vehicleCode, tableName]) => {
                const { data } = await state.supabase.from(tableName).select('*');
                (data || []).forEach((row) => {
                    const imageUrl =
                        row.img ||
                        row.IMG ||
                        row.image ||
                        row.image_url ||
                        row.obraz ||
                        '';
                    const equipmentId = row.equipment_id || row.id || null;
                    const equipmentName =
                        row.equipment_name ||
                        row['SPRZĘT'] ||
                        row['sprzęt'] ||
                        row['SPRZET'] ||
                        row['sprzet'] ||
                        '';

                    if (equipmentId && imageUrl && !state.catalogMapById.has(equipmentId)) {
                        state.catalogMapById.set(equipmentId, imageUrl);
                    }

                    if (equipmentName && imageUrl) {
                        const key = `${vehicleCode}|${String(equipmentName).trim().toLowerCase()}`;
                        if (!state.catalogMapByNameVehicle.has(key)) {
                            state.catalogMapByNameVehicle.set(key, imageUrl);
                        }
                    }
                });
            })
        );
    }

    async function loadVehiclesStatusTable() {
        const tbody = document.querySelector(selectors.vehicleBody);
        const empty = document.querySelector(selectors.vehicleEmpty);
        const loading = document.querySelector(selectors.vehicleLoading);
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        if (empty) empty.hidden = true;
        if (loading) loading.hidden = false;

        await ensureCatalogMap();

        const [totalsResult, issuesResult] = await Promise.all([
            loadVehicleTotals(),
            loadVehicleIssues(),
        ]);

        if (loading) loading.hidden = true;

        if (totalsResult.error || issuesResult.error) {
            console.error(totalsResult.error || issuesResult.error);
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'Nie udało się pobrać statusów pojazdów.';
            }
            return;
        }

        state.totals = totalsResult.data;
        state.issuesByVehicle = groupIssuesByVehicle(issuesResult.data);

        const rows = buildVehicleRows();
        if (!rows.length) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'Brak danych o pojazdach.';
            }
            return;
        }

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.className = 'issues-table__row--clickable';
            tr.tabIndex = 0;
            tr.innerHTML = `
                <td>${escapeHtml(row.vehicleCode)}</td>
                <td>${buildPercentBadgeHtml(row.percent)}</td>
                <td>${row.lastChangeLabel}</td>
                <td>${row.shiftLabel}</td>
            `;
            const open = () => openVehicleIssues(row.vehicleCode);
            tr.addEventListener('click', open);
            tr.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
            tbody.appendChild(tr);
        });
    }

    async function loadVehicleTotals() {
        const rpcResult = await state.supabase.rpc('get_vehicle_totals');
        if (!rpcResult.error && Array.isArray(rpcResult.data)) {
            return {
                data: rpcResult.data.map((row) => ({
                    vehicleCode: String(row.vehicle_code || '').trim(),
                    totalCount: Number(row.total_count || 0),
                })),
                error: null,
            };
        }

        const viewResult = await state.supabase
            .from('vehicle_totals')
            .select('vehicle_code, total_count');

        if (!viewResult.error && Array.isArray(viewResult.data)) {
            return {
                data: viewResult.data.map((row) => ({
                    vehicleCode: String(row.vehicle_code || '').trim(),
                    totalCount: Number(row.total_count || 0),
                })),
                error: null,
            };
        }

        return fallbackVehicleTotals();
    }

    async function fallbackVehicleTotals() {
        try {
            const rows = await Promise.all(
                Object.entries(VEHICLE_TABLES).map(async ([vehicleCode, tableName]) => {
                    const { count, error } = await state.supabase
                        .from(tableName)
                        .select('*', { count: 'exact', head: true });
                    if (error) {
                        throw error;
                    }
                    return { vehicleCode, totalCount: count || 0 };
                })
            );
            return { data: rows, error: null };
        } catch (error) {
            return { data: [], error };
        }
    }

    async function loadVehicleIssues() {
        const { data, error } = await state.supabase
            .from('equipment_issue_status')
            .select('equipment_id, equipment_name, vehicle_code, compartment_code, shift_code, status, note, issue_photo_path, updated_at')
            .order('updated_at', { ascending: false });

        return { data: Array.isArray(data) ? data : [], error };
    }

    function groupIssuesByVehicle(rows) {
        const grouped = new Map();
        (rows || []).forEach((row) => {
            const vehicleCode = String(row.vehicle_code || '').trim();
            if (!vehicleCode) {
                return;
            }
            if (!grouped.has(vehicleCode)) {
                grouped.set(vehicleCode, []);
            }
            grouped.get(vehicleCode).push(row);
        });
        return grouped;
    }

    function buildVehicleRows() {
        const totalsMap = new Map();
        state.totals.forEach((row) => {
            totalsMap.set(row.vehicleCode, row.totalCount);
        });
        state.issuesByVehicle.forEach((rows, vehicleCode) => {
            if (!totalsMap.has(vehicleCode)) {
                totalsMap.set(vehicleCode, 0);
            }
        });

        return Array.from(totalsMap.entries())
            .map(([vehicleCode, totalCount]) => {
                const issues = state.issuesByVehicle.get(vehicleCode) || [];
                const problemsCount = issues.length;
                const safeProblems = Math.min(problemsCount, totalCount || problemsCount);
                const percent = totalCount > 0
                    ? Math.max(0, Math.round((100 * (totalCount - safeProblems)) / totalCount))
                    : 0;
                const lastChange = issues.reduce((latest, row) => {
                    if (!row.updated_at) return latest;
                    if (!latest) return row.updated_at;
                    return new Date(row.updated_at) > new Date(latest) ? row.updated_at : latest;
                }, '');

                return {
                    vehicleCode,
                    percent,
                    lastChangeLabel: lastChange ? formatDateTime(lastChange) : '—',
                    shiftLabel: formatVehicleShiftLabels(issues),
                };
            })
            .sort((a, b) => a.vehicleCode.localeCompare(b.vehicleCode, 'pl'));
    }

    async function openVehicleIssues(vehicleCode) {
        const rows = state.issuesByVehicle.get(vehicleCode) || [];
        const overlay = document.createElement('div');
        overlay.className = 'equipment-preview-overlay is-visible';
        overlay.innerHTML = `
            <div class="equipment-preview equipment-preview--report" role="dialog" aria-modal="true" aria-labelledby="vehicle-issues-title">
                <header class="equipment-preview__header">
                    <div class="equipment-preview__heading">
                        <h2 id="vehicle-issues-title" class="equipment-preview__title">Status sprzętu - ${escapeHtml(vehicleCode)}</h2>
                    </div>
                    <button type="button" class="equipment-preview__close" data-action="close-vehicle-issues" aria-label="Zamknij">
                        <span aria-hidden="true">x</span>
                    </button>
                </header>
                <div class="equipment-preview__body">
                    ${rows.length ? `
                        <div class="responsive-table">
                            <table class="issues-table">
                                <thead>
                                    <tr>
                                        <th>Zdjęcie</th>
                                        <th>Nazwa sprzętu</th>
                                        <th>Skrytka</th>
                                        <th>Zmiana</th>
                                        <th>Status</th>
                                        <th>Uwagi</th>
                                        <th>Ostatnia zmiana</th>
                                    </tr>
                                </thead>
                                <tbody data-vehicle-issues-body></tbody>
                            </table>
                        </div>
                    ` : '<p class="equipment-preview__fallback">Brak aktywnych problemów dla tego wozu.</p>'}
                </div>
            </div>
        `;

        const close = () => {
            overlay.remove();
            syncBodyOverlayState();
        };

        overlay.querySelector('[data-action="close-vehicle-issues"]')?.addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
        document.body.appendChild(overlay);
        syncBodyOverlayState();

        const tbody = overlay.querySelector('[data-vehicle-issues-body]');
        if (!tbody) {
            return;
        }

        for (const row of rows) {
            const tr = document.createElement('tr');
            const key = `${row.vehicle_code || ''}|${String(row.equipment_name || '').trim().toLowerCase()}`;
            const catalogImage = state.catalogMapById.get(row.equipment_id) || state.catalogMapByNameVehicle.get(key) || '';
            tr.innerHTML = `
                <td>${catalogImage ? `<img class="issues-table__thumb" src="${catalogImage}" alt="${escapeHtml(row.equipment_name || 'sprzęt')}" />` : '-'}</td>
                <td>${escapeHtml(row.equipment_name || '-')}</td>
                <td>${escapeHtml(row.compartment_code || '-')}</td>
                <td>${escapeHtml(formatShiftLabel(row.shift_code))}</td>
                <td>${row.status === 'broken' ? 'Uszkodzony' : 'Brak'}</td>
                <td><button type="button" class="issues-table__note-btn" data-action="show-note">...</button></td>
                <td>${row.updated_at ? formatDateTime(row.updated_at) : '-'}</td>
            `;

            tr.querySelector('[data-action="show-note"]')?.addEventListener('click', async () => {
                const issuePhotoUrl = await resolveIssuePhotoUrl(row.issue_photo_path);
                showNoteModal({
                    title: row.equipment_name || 'Sprzęt',
                    note: row.note || '',
                    imageUrl: issuePhotoUrl,
                    emptyImageLabel: 'Brak zdjęcia użytkownika.',
                });
            });

            tbody.appendChild(tr);
        }
    }

    async function loadDutySummaryTable() {
        const tbody = document.querySelector(selectors.dutyBody);
        const empty = document.querySelector(selectors.dutyEmpty);
        const loading = document.querySelector(selectors.dutyLoading);
        const meta = document.querySelector(selectors.dutyMeta);
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        if (empty) empty.hidden = true;
        if (loading) loading.hidden = false;
        if (meta) meta.textContent = 'Ładowanie ostatniego raportu...';

        const { data: report, error: reportError } = await state.supabase
            .from('duty_reports')
            .select('id, created_at, shift_code')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (reportError) {
            console.error(reportError);
            if (loading) loading.hidden = true;
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'Nie udało się pobrać raportu Służby Dyżurnej.';
            }
            return;
        }

        if (!report) {
            if (loading) loading.hidden = true;
            if (meta) meta.textContent = 'Brak zapisanego raportu.';
            if (empty) empty.hidden = false;
            return;
        }

        const { data: lines, error: linesError } = await state.supabase
            .from('duty_report_lines')
            .select('id, item_id, norm_qty, have_qty, missing_qty, broken_qty, note, photo_path')
            .eq('report_id', report.id);

        const { data: items, error: itemsError } = await state.supabase
            .from('duty_items')
            .select('id, name')
            .eq('is_active', true);

        if (loading) loading.hidden = true;

        if (linesError || itemsError) {
            console.error(linesError || itemsError);
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'Nie udało się pobrać linii raportu.';
            }
            return;
        }

        const itemsById = new Map((items || []).map((item) => [item.id, item.name]));
        const rows = Array.isArray(lines) ? lines : [];
        if (!rows.length) {
            if (meta) meta.textContent = `Ostatni raport: ${formatDateTime(report.created_at)} | ${formatShiftLabel(report.shift_code)}`;
            if (empty) empty.hidden = false;
            return;
        }

        if (meta) meta.textContent = `Ostatni raport: ${formatDateTime(report.created_at)} | ${formatShiftLabel(report.shift_code)}`;

        rows
            .slice()
            .sort((a, b) => (itemsById.get(a.item_id) || '').localeCompare(itemsById.get(b.item_id) || '', 'pl'))
            .forEach((row) => {
                const tr = document.createElement('tr');
                const noteButton = (row.note || row.photo_path)
                    ? '<button type="button" class="issues-table__note-btn" data-action="show-duty-note">...</button>'
                    : '—';

                tr.innerHTML = `
                    <td>${escapeHtml(itemsById.get(row.item_id) || '-')}</td>
                    <td>${escapeHtml(`${row.have_qty ?? 0}/${row.norm_qty ?? 0}`)}</td>
                    <td>${escapeHtml(row.missing_qty ?? 0)}</td>
                    <td>${escapeHtml(row.broken_qty ?? 0)}</td>
                    <td>${noteButton}</td>
                    <td>${formatDateTime(report.created_at)}</td>
                    <td>${escapeHtml(formatShiftLabel(report.shift_code))}</td>
                `;

                tr.querySelector('[data-action="show-duty-note"]')?.addEventListener('click', async () => {
                    const imageUrl = await resolveIssuePhotoUrl(row.photo_path);
                    showNoteModal({
                        title: itemsById.get(row.item_id) || 'Uwagi',
                        note: row.note || '',
                        imageUrl,
                        emptyImageLabel: row.photo_path ? 'Nie udało się wczytać zdjęcia.' : '',
                    });
                });

                tbody.appendChild(tr);
            });
    }

    async function resolveIssuePhotoUrl(path) {
        if (!path) {
            return '';
        }
        const objectPath = path.startsWith('issue-photos/')
            ? path.replace('issue-photos/', '')
            : path;
        const { data, error } = await state.supabase.storage
            .from('issue-photos')
            .createSignedUrl(objectPath, 60 * 60);
        if (error) {
            return '';
        }
        return data?.signedUrl || '';
    }

    function showNoteModal({ title, note, imageUrl, emptyImageLabel }) {
        const overlay = document.createElement('div');
        overlay.className = 'equipment-preview-overlay is-visible';
        overlay.innerHTML = `
            <div class="equipment-preview" role="dialog" aria-modal="true">
                <header class="equipment-preview__header">
                    <h2 class="equipment-preview__title">${escapeHtml(title)}</h2>
                    <button type="button" class="equipment-preview__close" data-action="close-note" aria-label="Zamknij">
                        <span aria-hidden="true">x</span>
                    </button>
                </header>
                <div class="equipment-preview__body">
                    <p>${formatMultilineText(note || 'Brak uwag.')}</p>
                    ${imageUrl ? `<img class="issues-table__modal-photo" src="${imageUrl}" alt="Zdjęcie użytkownika" />` : (emptyImageLabel ? `<p>${escapeHtml(emptyImageLabel)}</p>` : '')}
                </div>
            </div>
        `;

        const close = () => {
            overlay.remove();
            syncBodyOverlayState();
        };

        overlay.querySelector('[data-action="close-note"]')?.addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
        document.body.appendChild(overlay);
        syncBodyOverlayState();
    }

    function buildPercentBadgeHtml(percent) {
        const appearance = getPercentBadgeAppearance(percent);
        const style = [
            `background-color: ${appearance.background}`,
            `border-color: ${appearance.border}`,
            `color: ${appearance.color}`,
        ].join('; ');

        return `<span class="${appearance.className}" style="${style}">${escapeHtml(`${percent}%`)}</span>`;
    }

    function getPercentBadgeAppearance(percent) {
        if (percent >= 100) {
            return {
                className: 'vehicle-status-badge vehicle-status-badge--ok',
                background: '#166534',
                border: '#22c55e',
                color: '#dcfce7',
            };
        }

        if (percent >= 80) {
            return {
                className: 'vehicle-status-badge vehicle-status-badge--warn',
                background: '#854d0e',
                border: '#facc15',
                color: '#fef3c7',
            };
        }

        return {
            className: 'vehicle-status-badge vehicle-status-badge--alert',
            background: '#991b1b',
            border: '#f87171',
            color: '#fee2e2',
        };
    }

    function formatVehicleShiftLabels(issues) {
        const labels = Array.from(new Set((issues || []).map((row) => formatShiftLabel(row.shift_code)).filter(Boolean)));
        return labels.length ? escapeHtml(labels.join(', ')) : '—';
    }

    function formatShiftLabel(value) {
        const map = {
            'zmiana-1': 'Zmiana I',
            'zmiana-2': 'Zmiana II',
            'zmiana-3': 'Zmiana III',
            biuro: 'Biuro',
        };
        const key = String(value || '').trim();
        return map[key] || key || '—';
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }
        return date.toLocaleString('pl-PL');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMultilineText(value) {
        return escapeHtml(value).replace(/\n/g, '<br />');
    }

    function syncBodyOverlayState() {
        const visibleOverlay = document.querySelector('.equipment-preview-overlay.is-visible');
        document.body.classList.toggle('has-equipment-preview', Boolean(visibleOverlay));
    }
})();
