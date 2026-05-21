// =========================================================
// Plik: assets/js/dashboard.js
// Home: zadania dnia oraz kompaktowy status pojazdow.
// =========================================================

(() => {
    const ATTENTION_HOLD_DELAY = 550;
    const ACTIVE_ISSUE_STATUSES = new Set(['missing', 'broken']);

    const selectors = {
        attentionList: '[data-attention-list]',
        attentionLoading: '[data-attention-loading]',
        attentionEmpty: '[data-attention-empty]',
    };

    const state = {
        supabase: null,
        issuesByVehicle: new Map(),
        refreshChannel: null,
        refreshTimerId: null,
        holdTimerId: null,
    };

    async function initDailyTasks() {
        const feedContainer = document.getElementById('daily-task');
        const emptyIndicator = document.querySelector('[data-feed-empty]');
        const dayHeading = document.querySelector('[data-day-label]');
        const { supabase } = window.AppCommon || {};

        const isoDayNumber = ((new Date().getDay() + 6) % 7) + 1; // 1 = poniedzialek, 7 = niedziela
        const dayNames = {
            1: 'Poniedziałek',
            2: 'Wtorek',
            3: 'Środa',
            4: 'Czwartek',
            5: 'Piątek',
            6: 'Sobota',
            7: 'Niedziela',
        };

        if (dayHeading) {
            dayHeading.textContent = `Zadania na ${dayNames[isoDayNumber] || 'dziś'}`;
        }

        if (!feedContainer || !emptyIndicator) {
            return;
        }

        if (!supabase) {
            emptyIndicator.textContent = 'Skonfiguruj Supabase, aby wczytać zadania.';
            emptyIndicator.hidden = false;
            return;
        }

        const { data, error } = await supabase
            .from('daily_tasks')
            .select('task_title, task_details, task_order')
            .eq('weekday', isoDayNumber)
            .order('task_order', { ascending: true, nullsFirst: false });

        if (error) {
            console.error(error);
            emptyIndicator.textContent = 'Nie udało się pobrać danych z Supabase.';
            emptyIndicator.hidden = false;
            return;
        }

        if (!data || data.length === 0) {
            emptyIndicator.textContent = 'Brak zadań przypisanych do tego dnia.';
            emptyIndicator.hidden = false;
            return;
        }

        emptyIndicator.hidden = true;
        feedContainer.hidden = false;
        feedContainer.innerHTML = data
            .map((item) => `
                <article class="feed-item">
                    <h3 class="feed-item__title">${escapeHtml(item.task_title || 'Zadanie')}</h3>
                    ${item.task_details ? `<p class="feed-item__description">${escapeHtml(item.task_details)}</p>` : ''}
                </article>
            `)
            .join('');
    }

    async function initAttentionDashboard() {
        state.supabase = window.AppCommon?.supabase || null;
        if (!state.supabase) {
            setAttentionStatus('Skonfiguruj Supabase, aby wczytać statusy pojazdów.', true);
            return;
        }

        setupAttentionRealtime();
        await loadAttentionIssues();
    }

    function setupAttentionRealtime() {
        if (!state.supabase || state.refreshChannel) {
            return;
        }

        state.refreshChannel = state.supabase
            .channel('home-equipment-attention')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_issue_status' }, scheduleAttentionRefresh)
            .subscribe();
    }

    function scheduleAttentionRefresh() {
        if (state.refreshTimerId) {
            window.clearTimeout(state.refreshTimerId);
        }
        state.refreshTimerId = window.setTimeout(() => {
            state.refreshTimerId = null;
            loadAttentionIssues();
        }, 150);
    }

    async function loadAttentionIssues() {
        const list = document.querySelector(selectors.attentionList);
        const empty = document.querySelector(selectors.attentionEmpty);
        if (!list || !empty) {
            return;
        }

        setAttentionStatus('Ładowanie statusów...', false);
        list.hidden = true;
        empty.hidden = true;
        list.innerHTML = '';

        const { data, error } = await state.supabase
            .from('equipment_issue_status')
            .select('equipment_name, vehicle_code, compartment_code, status, updated_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error(error);
            setAttentionStatus('Nie udało się pobrać statusów pojazdów.', true);
            return;
        }

        state.issuesByVehicle = groupIssuesByVehicle(data || []);
        const rows = buildAttentionRows(state.issuesByVehicle);

        setAttentionStatus('', false);
        if (!rows.length) {
            empty.hidden = false;
            return;
        }

        list.hidden = false;
        rows.forEach((row) => {
            list.appendChild(createAttentionRow(row));
        });
    }

    function groupIssuesByVehicle(rows) {
        const grouped = new Map();
        rows.forEach((row) => {
            const status = String(row.status || '').trim();
            const vehicleCode = String(row.vehicle_code || '').trim();
            if (!vehicleCode || !ACTIVE_ISSUE_STATUSES.has(status)) {
                return;
            }

            if (!grouped.has(vehicleCode)) {
                grouped.set(vehicleCode, []);
            }
            grouped.get(vehicleCode).push({
                equipmentName: String(row.equipment_name || 'Sprzęt').trim(),
                vehicleCode,
                compartmentCode: String(row.compartment_code || '').trim(),
                status,
                updatedAt: row.updated_at || '',
            });
        });
        return grouped;
    }

    function buildAttentionRows(groupedIssues) {
        return Array.from(groupedIssues.entries())
            .map(([vehicleCode, issues]) => {
                const missingCount = issues.filter((issue) => issue.status === 'missing').length;
                const brokenCount = issues.filter((issue) => issue.status === 'broken').length;
                const totalCount = missingCount + brokenCount;
                const severity = missingCount > 0 || totalCount > 1 ? 'alert' : 'warn';

                return {
                    vehicleCode,
                    issues,
                    missingCount,
                    brokenCount,
                    totalCount,
                    severity,
                    summary: buildAttentionSummary(missingCount, brokenCount),
                };
            })
            .filter((row) => row.totalCount > 0)
            .sort((left, right) => {
                const severityOrder = { alert: 0, warn: 1 };
                const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
                if (severityDiff !== 0) {
                    return severityDiff;
                }
                return left.vehicleCode.localeCompare(right.vehicleCode, 'pl');
            });
    }

    function createAttentionRow(row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `attention-item attention-item--${row.severity}`;
        button.dataset.vehicleCode = row.vehicleCode;
        button.setAttribute('aria-label', `${row.vehicleCode}: ${row.summary}. Przytrzymaj, aby zobaczyć szczegóły.`);

        const marker = document.createElement('span');
        marker.className = 'attention-item__marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = row.severity === 'alert' ? '🔴' : '🟠';

        const vehicle = document.createElement('strong');
        vehicle.className = 'attention-item__vehicle';
        vehicle.textContent = row.vehicleCode;

        const summary = document.createElement('span');
        summary.className = 'attention-item__summary';
        summary.textContent = row.summary;

        button.append(marker, vehicle, summary);
        bindAttentionRowInteractions(button, row.vehicleCode);
        return button;
    }

    function bindAttentionRowInteractions(element, vehicleCode) {
        const start = (event) => {
            if (event.type === 'mousedown' && event.button !== 0) {
                return;
            }
            clearAttentionHold();
            element.classList.add('is-holding');
            state.holdTimerId = window.setTimeout(() => {
                state.holdTimerId = null;
                element.classList.remove('is-holding');
                openAttentionPopup(vehicleCode);
            }, ATTENTION_HOLD_DELAY);
        };
        const cancel = () => {
            element.classList.remove('is-holding');
            clearAttentionHold();
        };

        element.addEventListener('mousedown', start);
        element.addEventListener('mouseup', cancel);
        element.addEventListener('mouseleave', cancel);
        element.addEventListener('touchstart', start, { passive: true });
        element.addEventListener('touchend', cancel);
        element.addEventListener('touchcancel', cancel);
        element.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            cancel();
            openAttentionPopup(vehicleCode);
        });
        element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openAttentionPopup(vehicleCode);
            }
        });
    }

    function clearAttentionHold() {
        if (state.holdTimerId) {
            window.clearTimeout(state.holdTimerId);
            state.holdTimerId = null;
        }
    }

    function openAttentionPopup(vehicleCode) {
        const issues = state.issuesByVehicle.get(vehicleCode) || [];
        const overlay = document.createElement('div');
        overlay.className = 'attention-popup-overlay is-visible';
        overlay.innerHTML = `
            <section class="attention-popup" role="dialog" aria-modal="true" aria-labelledby="attention-popup-title">
                <header class="attention-popup__header">
                    <div>
                        <p class="attention-popup__eyebrow">Problemy pojazdu</p>
                        <h2 id="attention-popup-title">${escapeHtml(vehicleCode)}</h2>
                    </div>
                    <button type="button" class="attention-popup__close" data-action="close-attention-popup" aria-label="Zamknij">×</button>
                </header>
                <div class="attention-popup__body">
                    ${issues.length ? `
                        <ul class="attention-popup__list">
                            ${issues.map(renderAttentionIssue).join('')}
                        </ul>
                    ` : '<p class="attention-popup__empty">Brak aktywnych problemów dla tego pojazdu.</p>'}
                </div>
                <footer class="attention-popup__footer">
                    <a class="btn btn--primary" href="panel-dowodcy.html#status">Przejdź do statusu</a>
                </footer>
            </section>
        `;

        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleEscape);
            document.body.classList.remove('has-attention-popup');
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                close();
            }
        };

        overlay.querySelector('[data-action="close-attention-popup"]')?.addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close();
            }
        });
        document.addEventListener('keydown', handleEscape);
        document.body.appendChild(overlay);
        document.body.classList.add('has-attention-popup');
    }

    function renderAttentionIssue(issue) {
        const statusLabel = issue.status === 'broken' ? 'USZKODZONA' : 'BRAK';
        const statusClass = issue.status === 'broken' ? 'is-broken' : 'is-missing';
        const compartment = issue.compartmentCode
            ? `<span class="attention-popup__compartment">Skrytka: ${escapeHtml(issue.compartmentCode)}</span>`
            : '';

        return `
            <li class="attention-popup__issue">
                <span class="attention-popup__issue-name">${escapeHtml(issue.equipmentName || 'Sprzęt')}</span>
                <span class="attention-popup__issue-status ${statusClass}">${statusLabel}</span>
                ${compartment}
            </li>
        `;
    }

    function buildAttentionSummary(missingCount, brokenCount) {
        const parts = [];
        if (missingCount > 0) {
            parts.push(formatMissingCount(missingCount));
        }
        if (brokenCount > 0) {
            parts.push(formatBrokenCount(brokenCount));
        }
        return parts.join(', ');
    }

    function formatMissingCount(count) {
        if (count === 1) {
            return '1 brak';
        }
        if (count > 1 && count < 5) {
            return `${count} braki`;
        }
        return `${count} braków`;
    }

    function formatBrokenCount(count) {
        if (count === 1) {
            return '1 uszkodzony';
        }
        if (count > 1 && count < 5) {
            return `${count} uszkodzone`;
        }
        return `${count} uszkodzonych`;
    }

    function setAttentionStatus(message, isError) {
        const loading = document.querySelector(selectors.attentionLoading);
        if (!loading) {
            return;
        }
        loading.textContent = message || '';
        loading.hidden = !message;
        loading.classList.toggle('attention-panel__status--error', Boolean(isError));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await Promise.all([
            initAttentionDashboard(),
            initDailyTasks(),
        ]);

        const shortcutCards = document.querySelectorAll('.dashboard-card');
        shortcutCards.forEach((card) => {
            card.addEventListener('mouseenter', () => card.classList.add('is-hover'));
            card.addEventListener('mouseleave', () => card.classList.remove('is-hover'));
        });
    });
})();
