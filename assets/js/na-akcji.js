// =========================================================
// File: assets/js/na-akcji.js
// Manage fire rota duplication and timers
// =========================================================

(() => {
    const selectors = {
        tabButtons: '[data-action-tab]',
        tabPanels: '[data-tab-panel]',
        fireRotas: '[data-fire-rotas]',
        fireAddButton: '[data-action="add-fire-rota"]',
        fireTemplate: '#fire-rota-template',
        fireRota: '[data-fire-rota]',
        fireTimerDisplay: '[data-fire-timer]',
        fireTable: '.fire-rota__table table',
        coSection: '[data-co-section]',
        coRowsContainer: '[data-co-rows]',
        coRow: '[data-co-row]',
        coRowTemplate: '#co-row-template',
        coAddRowButton: '[data-action="add-co-row"]',
        coSaveButton: '[data-action="save-co-rows"]',
        serviceSaveButton: '[data-action="save-service-row"]',
        coTableBody: '[data-co-table-body]',
        coEmptyState: '[data-co-empty]',
        serviceTableBody: '[data-service-table-body]',
        serviceEmptyState: '[data-service-empty]',
        coShareButton: '[data-action="share-co-table"]',
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupTabs();
        setupFireSection();
        setupCoSection();
    });

    function setupTabs() {
        const buttons = Array.from(document.querySelectorAll(selectors.tabButtons));
        const panels = Array.from(document.querySelectorAll(selectors.tabPanels));
        if (!buttons.length || !panels.length) {
            return;
        }

        buttons.forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.dataset.actionTab;
                buttons.forEach((btn) => {
                    const isActive = btn === button;
                    btn.classList.toggle('is-active', isActive);
                    btn.setAttribute('aria-selected', String(isActive));
                    btn.setAttribute('tabindex', isActive ? '0' : '-1');
                });

                panels.forEach((panel) => {
                    const shouldShow = panel.dataset.tabPanel === target;
                    panel.hidden = !shouldShow;
                });
            });
        });
    }

    function setupFireSection() {
        const container = document.querySelector(selectors.fireRotas);
        const addButton = document.querySelector(selectors.fireAddButton);
        const template = document.querySelector(selectors.fireTemplate);
        if (!container || !addButton || !template) {
            return;
        }

        const timerDurationSeconds = 10 * 60;
        const warningThresholdSeconds = 60;

        const applyTableLabels = (table) => {
            if (!table) {
                return;
            }
            const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
            if (!headers.length) {
                return;
            }
            const rowHeader = headers[0] || '';
            table.querySelectorAll('tbody tr').forEach((row) => {
                const headerCell = row.querySelector('th[scope="row"]');
                if (headerCell) {
                    headerCell.dataset.label = rowHeader;
                }
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    const headerText = headers[index + 1] || headers[index] || '';
                    if (headerText) {
                        cell.dataset.label = headerText;
                    }
                });
            });
        };

        const applyLabelsToAllTables = () => {
            const tables = container.querySelectorAll(selectors.fireTable);
            tables.forEach(applyTableLabels);
        };

        const setupRotaTimer = (rota) => {
            if (!rota || rota.dataset.timerInitialized === 'true') {
                return;
            }

            const timerDisplay = rota.querySelector(selectors.fireTimerDisplay);

            if (!timerDisplay) {
                return;
            }

            rota.dataset.timerInitialized = 'true';

            let timerIntervalId = null;
            let remainingSeconds = timerDurationSeconds;

            const clearWarningState = () => {
                rota.classList.remove('fire-rota--warning');
            };

            const applyWarningState = () => {
                rota.classList.add('fire-rota--warning');
            };

            const updateTimerDisplay = (totalSeconds) => {
                const safeSeconds = Math.max(0, Math.floor(totalSeconds));
                const minutes = Math.floor(safeSeconds / 60);
                const seconds = safeSeconds % 60;
                timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                if (safeSeconds <= warningThresholdSeconds) {
                    applyWarningState();
                } else {
                    clearWarningState();
                }
            };

            const stopTimer = () => {
                if (timerIntervalId !== null) {
                    window.clearInterval(timerIntervalId);
                    timerIntervalId = null;
                }
            };

            const startTimer = () => {
                stopTimer();
                remainingSeconds = timerDurationSeconds;
                clearWarningState();
                updateTimerDisplay(remainingSeconds);

                timerIntervalId = window.setInterval(() => {
                    remainingSeconds -= 1;

                    if (remainingSeconds <= 0) {
                        updateTimerDisplay(0);
                        stopTimer();
                        return;
                    }

                    updateTimerDisplay(remainingSeconds);
                }, 1000);
            };

            updateTimerDisplay(remainingSeconds);
            timerDisplay.addEventListener('click', startTimer);
        };

        const existingRotas = container.querySelectorAll(selectors.fireRota);
        existingRotas.forEach(setupRotaTimer);
        applyLabelsToAllTables();

        addButton.addEventListener('click', () => {
            const fragment = template.content.cloneNode(true);
            const newRota = fragment.querySelector(selectors.fireRota);
            container.appendChild(fragment);
            if (newRota) {
                setupRotaTimer(newRota);
                const table = newRota.querySelector(selectors.fireTable);
                applyTableLabels(table);
            }
        });
    }

        function setupCoSection() {
        const section = document.querySelector(selectors.coSection);
        if (!section) {
            return;
        }

        const rowsContainer = section.querySelector(selectors.coRowsContainer);
        const addRowButton = section.querySelector(selectors.coAddRowButton);
        const saveButton = section.querySelector(selectors.coSaveButton);
        const serviceSaveButton = section.querySelector(selectors.serviceSaveButton);
        const tableBody = section.querySelector(selectors.coTableBody);
        const emptyStateRow = section.querySelector(selectors.coEmptyState);
        const serviceTableBody = section.querySelector(selectors.serviceTableBody);
        const serviceEmptyStateRow = section.querySelector(selectors.serviceEmptyState);
        const shareButton = section.querySelector(selectors.coShareButton);
        const template = document.querySelector(selectors.coRowTemplate);

        if (!rowsContainer || !addRowButton || !saveButton || !serviceSaveButton || !tableBody || !serviceTableBody) {
            return;
        }

        const coDefaults = {
            doorState: 'Otwarte',
        };
        const coHeaders = ['Nr mieszkania', 'Pi\u0119tro', 'PPM', 'Drzwi'];
        const serviceHeaders = ['Policja', 'Pogotowie', 'P.Gazowe', 'P. Techniczne'];

        const ensureTableState = (body, emptyRow, rowSelector) => {
            const hasDataRows = body.querySelectorAll(rowSelector).length > 0;
            if (emptyRow) {
                emptyRow.hidden = hasDataRows;
            }
            return hasDataRows;
        };

        const updateShareState = () => {
            if (!shareButton) {
                return;
            }
            const hasMeasurementRows = tableBody.querySelectorAll('tr[data-co-data]').length > 0;
            const hasServiceRows = serviceTableBody.querySelectorAll('tr[data-service-data]').length > 0;
            shareButton.disabled = !(hasMeasurementRows || hasServiceRows);
        };

        const createRow = () => {
            if (!template) {
                return null;
            }
            const fragment = template.content.cloneNode(true);
            const row = fragment.querySelector(selectors.coRow);
            if (row) {
                rowsContainer.appendChild(fragment);
            }
            return row;
        };

        const gatherRowData = (row) => {
            const apartmentInput = row.querySelector('[data-co-field="apartment"]');
            const floorInput = row.querySelector('[data-co-field="floor"]');
            const ppmInput = row.querySelector('[data-co-field="ppm"]');
            const doorSelect = row.querySelector('[data-co-field="doorState"]');

            const apartment = apartmentInput ? apartmentInput.value.trim() : '';
            const floor = floorInput ? floorInput.value.trim() : '';
            const ppmValue = ppmInput ? ppmInput.value.trim() : '';
            const ppm = ppmValue === '' ? '' : ppmValue;
            const doorState = doorSelect ? doorSelect.value.trim() : coDefaults.doorState;

            const isEmpty = !apartment && !floor && ppm === '';
            return isEmpty ? null : { apartment, floor, ppm, doorState };
        };

        const clearRows = () => {
            const rows = Array.from(rowsContainer.querySelectorAll(selectors.coRow));
            if (!rows.length) {
                createRow();
                return;
            }

            rows.forEach((row, index) => {
                if (index > 0) {
                    row.remove();
                    return;
                }

                const apartmentInput = row.querySelector('[data-co-field="apartment"]');
                const floorInput = row.querySelector('[data-co-field="floor"]');
                const ppmInput = row.querySelector('[data-co-field="ppm"]');
                const doorSelect = row.querySelector('[data-co-field="doorState"]');

                if (apartmentInput) apartmentInput.value = '';
                if (floorInput) floorInput.value = '';
                if (ppmInput) ppmInput.value = '';
                if (doorSelect) doorSelect.value = '';
            });
        };

        const clearServiceFields = () => {
            const inputs = section.querySelectorAll('[data-service-field]');
            inputs.forEach((input) => {
                input.value = '';
            });
        };

        const appendMeasurementRow = (entry) => {
            const tr = document.createElement('tr');
            tr.dataset.coData = 'true';

            const cells = [
                entry.apartment || 'brak',
                entry.floor || 'brak',
                entry.ppm === '' ? 'brak' : entry.ppm,
                entry.doorState || coDefaults.doorState,
            ];

            cells.forEach((value) => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });

            tableBody.appendChild(tr);
        };

        const gatherServiceData = () => {
            const policeInput = section.querySelector('[data-service-field="police"]');
            const ambulanceInput = section.querySelector('[data-service-field="ambulance"]');
            const gasInput = section.querySelector('[data-service-field="gas"]');
            const technicalInput = section.querySelector('[data-service-field="technical"]');

            const police = policeInput ? policeInput.value.trim() : '';
            const ambulance = ambulanceInput ? ambulanceInput.value.trim() : '';
            const gas = gasInput ? gasInput.value.trim() : '';
            const technical = technicalInput ? technicalInput.value.trim() : '';

            return { police, ambulance, gas, technical };
        };

        const appendServiceRow = (entry) => {
            const tr = document.createElement('tr');
            tr.dataset.serviceData = 'true';

            const cells = [
                entry.police || 'brak',
                entry.ambulance || 'brak',
                entry.gas || 'brak',
                entry.technical || 'brak',
            ];

            cells.forEach((value) => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });

            serviceTableBody.appendChild(tr);
        };

        const existingRows = rowsContainer.querySelectorAll(selectors.coRow);
        if (!existingRows.length) {
            createRow();
        }

        addRowButton.addEventListener('click', () => {
            if (!template) {
                return;
            }
            createRow();
        });

        saveButton.addEventListener('click', () => {
            const rows = Array.from(rowsContainer.querySelectorAll(selectors.coRow));
            const entries = rows
                .map(gatherRowData)
                .filter((entry) => entry !== null);

            if (!entries.length) {
                return;
            }

            entries.forEach((entry) => {
                appendMeasurementRow(entry);
            });
            ensureTableState(tableBody, emptyStateRow, 'tr[data-co-data]');
            updateShareState();
            clearRows();
        });

        serviceSaveButton.addEventListener('click', () => {
            const entry = gatherServiceData();
            appendServiceRow(entry);
            ensureTableState(serviceTableBody, serviceEmptyStateRow, 'tr[data-service-data]');
            updateShareState();
            clearServiceFields();
        });

        if (shareButton) {
            shareButton.addEventListener('click', () => {
                const dataRows = Array.from(tableBody.querySelectorAll('tr[data-co-data]'));
                const serviceRows = Array.from(serviceTableBody.querySelectorAll('tr[data-service-data]'));
                if (!dataRows.length && !serviceRows.length) {
                    return;
                }

                const measurementLines = dataRows.map((row) => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const parts = coHeaders.map((header, index) => {
                        const cell = cells[index];
                        const value = cell ? cell.textContent.trim() : '';
                        return `${header}: ${value || 'brak'}`;
                    });
                    return parts.join(' | ');
                });

                const serviceLines = serviceRows.map((row) => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const parts = serviceHeaders.map((header, index) => {
                        const cell = cells[index];
                        const value = cell ? cell.textContent.trim() : '';
                        return `${header}: ${value || 'brak'}`;
                    });
                    return parts.join(' | ');
                });

                const messageLines = ['Pomiary - wyniki', '', 'Pomiary:'];
                if (measurementLines.length) {
                    messageLines.push(...measurementLines);
                } else {
                    messageLines.push('- brak');
                }
                messageLines.push('', 'S\u0142u\u017cby:');
                if (serviceLines.length) {
                    messageLines.push(...serviceLines);
                } else {
                    messageLines.push('- brak');
                }

                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(messageLines.join('\n'))}`;
                const popup = window.open(whatsappUrl, '_blank');
                if (!popup) {
                    window.location.href = whatsappUrl;
                }
            });
        }

        ensureTableState(tableBody, emptyStateRow, 'tr[data-co-data]');
        ensureTableState(serviceTableBody, serviceEmptyStateRow, 'tr[data-service-data]');
        updateShareState();
    }
})();













