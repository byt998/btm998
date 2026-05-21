(() => {
    const DUTY_MEASURE_ITEM_TOKEN = 'pomiar';
    const STORAGE_BUCKET = 'issue-photos';

    const selectors = {
        shiftLabel: '[data-duty-shift-label]',
        body: '[data-duty-body]',
        loading: '[data-duty-loading]',
        empty: '[data-duty-empty]',
        meta: '[data-duty-meta]',
        status: '[data-duty-status]',
        save: '[data-action="save-duty-report"]',
        deviceOverlay: '[data-duty-device-overlay]',
        deviceBody: '[data-duty-device-body]',
        closeDeviceModal: '[data-action="close-duty-device-modal"]',
        applyDeviceModal: '[data-action="apply-duty-device-modal"]',
        lineNoteOverlay: '[data-duty-note-overlay]',
        lineNoteTitle: '[data-duty-note-title]',
        lineNoteTextarea: '[data-duty-line-note]',
        lineNoteFile: '[data-duty-line-photo]',
        lineNoteFileName: '[data-duty-line-file-name]',
        closeLineNoteModal: '[data-action="close-duty-note-modal"]',
        applyLineNoteModal: '[data-action="apply-duty-note-modal"]',
        openLineCamera: '[data-action="open-duty-line-camera"]',
        cameraOverlay: '[data-duty-camera-overlay]',
        cameraVideo: '[data-duty-camera-video]',
        cameraCanvas: '[data-duty-camera-canvas]',
        closeCamera: '[data-action="close-duty-camera"]',
        captureCamera: '[data-action="capture-duty-camera"]',
    };

    const state = {
        supabase: null,
        user: null,
        profile: null,
        items: [],
        devices: [],
        lineDrafts: new Map(),
        deviceDrafts: new Map(),
        latestReport: null,
        activeLineNoteItemId: null,
        cameraContext: null,
        cameraStream: null,
    };

    document.addEventListener('DOMContentLoaded', initModule);

    async function initModule() {
        const { supabase, getCachedProfile, refreshProfile } = window.AppCommon || {};
        state.supabase = supabase || null;
        state.profile = getCachedProfile?.() || null;

        if (!state.supabase) {
            updateStatus('Brak konfiguracji Supabase.', 'error');
            return;
        }

        const { data } = await state.supabase.auth.getSession();
        state.user = data.session?.user || null;
        if (!state.profile && state.user) {
            state.profile = await refreshProfile?.(state.user);
        }

        document.querySelector(selectors.save)?.addEventListener('click', saveDutyReport);
        document.querySelector(selectors.closeDeviceModal)?.addEventListener('click', closeMeasureDeviceModal);
        document.querySelector(selectors.applyDeviceModal)?.addEventListener('click', closeMeasureDeviceModal);
        document.querySelector(selectors.deviceOverlay)?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                closeMeasureDeviceModal();
            }
        });

        document.querySelector(selectors.closeLineNoteModal)?.addEventListener('click', closeLineNoteModal);
        document.querySelector(selectors.applyLineNoteModal)?.addEventListener('click', closeLineNoteModal);
        document.querySelector(selectors.lineNoteOverlay)?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                closeLineNoteModal();
            }
        });
        document.querySelector(selectors.lineNoteTextarea)?.addEventListener('input', handleLineNoteInput);
        document.querySelector(selectors.lineNoteFile)?.addEventListener('change', handleLinePhotoChange);
        document.querySelector(selectors.openLineCamera)?.addEventListener('click', openLineCamera);
        document.querySelectorAll(selectors.closeCamera).forEach((button) => {
            button.addEventListener('click', closeCameraModal);
        });
        document.querySelector(selectors.captureCamera)?.addEventListener('click', captureCameraPhoto);
        document.querySelector(selectors.cameraOverlay)?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                closeCameraModal();
            }
        });

        await loadInitialData();
    }

    async function loadInitialData() {
        toggleLoading(true);
        updateStatus('', 'info');

        const [itemsResult, devicesResult] = await Promise.all([
            loadDutyItems(),
            loadMeasureDevices(),
        ]);

        toggleLoading(false);

        if (itemsResult.error || devicesResult.error) {
            console.error(itemsResult.error || devicesResult.error);
            updateStatus('Nie udalo sie pobrac danych Sluzby Dyzurnej.', 'error');
            return;
        }

        state.items = itemsResult.data;
        state.devices = devicesResult.data;
        state.latestReport = null;

        buildLineDrafts();
        buildDeviceDrafts();
        syncMeasureItemDraftFromDevices();
        renderDutyTable();
        renderMeasureDeviceModal();
        applyLatestReportMeta();
    }

    async function loadDutyItems() {
        const { data, error } = await state.supabase
            .from('duty_items')
            .select('id, name, norm_qty, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true });

        return { data: Array.isArray(data) ? data : [], error };
    }

    async function loadMeasureDevices() {
        const { data, error } = await state.supabase
            .from('duty_measure_devices')
            .select('id, name, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true });

        return { data: Array.isArray(data) ? data : [], error };
    }

    function buildLineDrafts(lines = []) {
        state.lineDrafts.clear();
        const linesByItemId = new Map((lines || []).map((line) => [line.item_id, line]));

        state.items.forEach((item) => {
            const existing = linesByItemId.get(item.id);
            state.lineDrafts.set(item.id, {
                itemId: item.id,
                name: item.name,
                normQty: Number(existing?.norm_qty ?? item.norm_qty ?? 0),
                haveQty: Number(existing?.have_qty ?? item.norm_qty ?? 0),
                brokenQty: Number(existing?.broken_qty ?? 0),
                note: existing?.note || '',
                photoPath: existing?.photo_path || '',
                photoFile: null,
                photoFileName: '',
            });
        });
    }

    function buildDeviceDrafts(deviceStatuses = []) {
        state.deviceDrafts.clear();
        const existingByDeviceId = new Map((deviceStatuses || []).map((row) => [row.device_id, row]));

        state.devices.forEach((device) => {
            const existing = existingByDeviceId.get(device.id);
            state.deviceDrafts.set(device.id, {
                deviceId: device.id,
                name: device.name,
                status: existing?.status || 'ok',
                note: existing?.note || '',
                photoPath: existing?.photo_path || '',
                photoFile: null,
                photoFileName: '',
            });
        });
    }

    function renderDutyTable() {
        const tbody = document.querySelector(selectors.body);
        const empty = document.querySelector(selectors.empty);
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        if (!state.items.length) {
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        syncShiftLabel();

        state.items.forEach((item) => {
            const draft = state.lineDrafts.get(item.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${buildItemNameCell(item.name)}</td>
                <td>${draft.normQty}</td>
                <td><input type="number" min="0" class="duty-service__input" data-duty-have="${item.id}" value="${draft.haveQty}" /></td>
                <td><input type="number" min="0" class="duty-service__input" data-duty-broken="${item.id}" value="${draft.brokenQty}" /></td>
                <td>${buildLineNoteButton(draft)}</td>
                <td data-duty-date-cell>${formatDateTime(state.latestReport?.created_at)}</td>
                <td data-duty-shift-cell>${escapeHtml(formatShiftLabel(state.latestReport?.shift_code))}</td>
            `;

            tr.querySelector(`[data-duty-have="${item.id}"]`)?.addEventListener('input', (event) => {
                draft.haveQty = normalizeNonNegative(event.target.value);
                event.target.value = draft.haveQty;
            });

            tr.querySelector(`[data-duty-broken="${item.id}"]`)?.addEventListener('input', (event) => {
                draft.brokenQty = normalizeNonNegative(event.target.value);
                event.target.value = draft.brokenQty;
            });

            tr.querySelector('[data-action="open-duty-devices"]')?.addEventListener('click', openMeasureDeviceModal);
            tr.querySelector(`[data-action="open-duty-note"][data-item-id="${item.id}"]`)?.addEventListener('click', () => {
                openLineNoteModal(item.id);
            });
            tbody.appendChild(tr);
        });
    }

    function renderMeasureDeviceModal() {
        const tbody = document.querySelector(selectors.deviceBody);
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        state.devices.forEach((device) => {
            const draft = state.deviceDrafts.get(device.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(device.name)}</td>
                <td><input type="radio" name="duty-device-status-${device.id}" data-duty-device-status="${device.id}" value="broken" ${draft.status === 'broken' ? 'checked' : ''} /></td>
                <td><input type="radio" name="duty-device-status-${device.id}" data-duty-device-status="${device.id}" value="missing" ${draft.status === 'missing' ? 'checked' : ''} /></td>
                <td><input type="radio" name="duty-device-status-${device.id}" data-duty-device-status="${device.id}" value="ok" ${draft.status === 'ok' ? 'checked' : ''} /></td>
                <td>
                    <div class="duty-service__device-note">
                        <textarea class="duty-service__note" data-duty-device-note="${device.id}" rows="2">${escapeHtml(draft.note)}</textarea>
                        <button type="button" class="btn btn--ghost duty-service__file-label" data-action="open-duty-device-camera" data-device-id="${device.id}">Zdjecie</button>
                        <input type="file" accept="image/*" capture="environment" data-duty-device-photo="${device.id}" hidden />
                        <span class="duty-service__file-name" data-duty-device-file-name="${device.id}">${escapeHtml(getDraftFileLabel(draft, 'Brak zdjecia'))}</span>
                    </div>
                </td>
            `;

            tr.querySelectorAll(`[data-duty-device-status="${device.id}"]`).forEach((radio) => {
                radio.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        draft.status = event.target.value;
                        syncMeasureItemDraftFromDevices();
                        renderDutyTable();
                    }
                });
            });

            tr.querySelector(`[data-duty-device-note="${device.id}"]`)?.addEventListener('input', (event) => {
                draft.note = event.target.value;
            });

            tr.querySelector(`[data-duty-device-photo="${device.id}"]`)?.addEventListener('change', (event) => {
                const [file] = Array.from(event.target.files || []);
                draft.photoFile = file || null;
                draft.photoFileName = file?.name || '';
                const fileName = tr.querySelector(`[data-duty-device-file-name="${device.id}"]`);
                if (fileName) {
                    fileName.textContent = getDraftFileLabel(draft, 'Brak zdjecia');
                }
            });

            tr.querySelector(`[data-action="open-duty-device-camera"][data-device-id="${device.id}"]`)?.addEventListener('click', () => {
                openDeviceCamera(device.id);
            });

            tbody.appendChild(tr);
        });
    }

    function buildItemNameCell(name) {
        const normalizedName = normalizeLabel(name);
        if (!normalizedName.includes(DUTY_MEASURE_ITEM_TOKEN)) {
            return escapeHtml(name);
        }

        return `
            <button type="button" class="duty-service__link" data-action="open-duty-devices">
                ${escapeHtml(name)}
            </button>
        `;
    }

    function syncMeasureItemDraftFromDevices() {
        const measureItem = state.items.find((item) => normalizeLabel(item.name).includes(DUTY_MEASURE_ITEM_TOKEN));
        if (!measureItem) {
            return;
        }

        const draft = state.lineDrafts.get(measureItem.id);
        if (!draft) {
            return;
        }

        const statuses = Array.from(state.deviceDrafts.values()).map((device) => device.status);
        const missingCount = statuses.filter((status) => status === 'missing').length;
        const brokenCount = statuses.filter((status) => status === 'broken').length;
        const totalDevices = state.devices.length;

        draft.haveQty = Math.max(0, totalDevices - missingCount);
        draft.brokenQty = brokenCount;
    }

    function buildLineNoteButton(draft) {
        const hasContent = Boolean(String(draft.note || '').trim() || draft.photoFile || draft.photoPath);
        return `
            <button type="button" class="duty-service__note-button${hasContent ? ' is-filled' : ''}" data-action="open-duty-note" data-item-id="${draft.itemId}" aria-label="Otworz uwagi">
                <span aria-hidden="true">&#128172;</span>
            </button>
        `;
    }

    function openLineNoteModal(itemId) {
        state.activeLineNoteItemId = itemId;
        const draft = state.lineDrafts.get(itemId);
        if (!draft) {
            return;
        }

        const item = state.items.find((entry) => entry.id === itemId);
        const overlay = document.querySelector(selectors.lineNoteOverlay);
        const title = document.querySelector(selectors.lineNoteTitle);
        const textarea = document.querySelector(selectors.lineNoteTextarea);
        const fileName = document.querySelector(selectors.lineNoteFileName);
        const fileInput = document.querySelector(selectors.lineNoteFile);
        if (!overlay || !title || !textarea || !fileName || !fileInput) {
            return;
        }

        title.textContent = item?.name || 'Uwagi';
        textarea.value = draft.note || '';
        fileInput.value = '';
        fileName.textContent = getDraftFileLabel(draft, 'Brak zdjecia');

        overlay.hidden = false;
        overlay.classList.add('is-visible');
        document.body.classList.add('has-equipment-preview');
    }

    function closeLineNoteModal() {
        const overlay = document.querySelector(selectors.lineNoteOverlay);
        if (!overlay) {
            return;
        }
        overlay.hidden = true;
        overlay.classList.remove('is-visible');
        state.activeLineNoteItemId = null;
        syncBodyOverlayState();
        renderDutyTable();
    }

    function handleLineNoteInput(event) {
        const draft = state.lineDrafts.get(state.activeLineNoteItemId);
        if (!draft) {
            return;
        }
        draft.note = event.target.value;
    }

    function handleLinePhotoChange(event) {
        const draft = state.lineDrafts.get(state.activeLineNoteItemId);
        if (!draft) {
            return;
        }

        const [file] = Array.from(event.target.files || []);
        draft.photoFile = file || null;
        draft.photoFileName = file?.name || '';

        const label = document.querySelector(selectors.lineNoteFileName);
        if (label) {
            label.textContent = getDraftFileLabel(draft, 'Brak zdjecia');
        }
    }

    function openLineCamera() {
        openCameraModal({ type: 'line', itemId: state.activeLineNoteItemId });
    }

    function openDeviceCamera(deviceId) {
        openCameraModal({ type: 'device', deviceId });
    }

    function openMeasureDeviceModal() {
        const overlay = document.querySelector(selectors.deviceOverlay);
        if (!overlay) {
            return;
        }
        overlay.hidden = false;
        overlay.classList.add('is-visible');
        document.body.classList.add('has-equipment-preview');
    }

    function closeMeasureDeviceModal() {
        const overlay = document.querySelector(selectors.deviceOverlay);
        if (!overlay) {
            return;
        }
        overlay.hidden = true;
        overlay.classList.remove('is-visible');
        syncBodyOverlayState();
    }

    async function saveDutyReport() {
        if (!state.supabase || !state.user) {
            updateStatus('Brak aktywnej sesji uzytkownika.', 'error');
            return;
        }

        const shiftCode = getCurrentShiftCode();
        if (!shiftCode) {
            updateStatus('Brak przypisanej zmiany dla zalogowanego uzytkownika.', 'error');
            return;
        }

        const saveButton = document.querySelector(selectors.save);
        if (saveButton) {
            saveButton.disabled = true;
        }
        updateStatus('Zapisywanie raportu...', 'info');
        const warnings = [];

        const { data: report, error: reportError } = await state.supabase
            .from('duty_reports')
            .insert({
                shift_code: shiftCode,
                created_by: state.user.id,
            })
            .select('id, created_at, shift_code, created_by')
            .single();

        if (reportError || !report) {
            console.error(reportError);
            updateStatus('Nie udalo sie zapisac naglowka raportu.', 'error');
            if (saveButton) saveButton.disabled = false;
            return;
        }

        const linePayload = [];
        for (const item of state.items) {
            const draft = state.lineDrafts.get(item.id);
            const photoPath = await uploadReportLinePhoto(report.id, item.id, draft);
            if (photoPath === null && draft.photoFile) {
                warnings.push(`Brak zapisu zdjecia dla pozycji: ${item.name}.`);
            }

            const haveQty = normalizeNonNegative(draft.haveQty);
            const brokenQty = normalizeNonNegative(draft.brokenQty);
            const normQty = normalizeNonNegative(draft.normQty);
            const nextPhotoPath = photoPath || draft.photoPath || null;
            const row = {
                report_id: report.id,
                item_id: item.id,
                norm_qty: normQty,
                have_qty: haveQty,
                missing_qty: Math.max(0, normQty - haveQty),
                broken_qty: brokenQty,
                note: draft.note.trim() || null,
                updated_at: report.created_at,
            };

            if (nextPhotoPath) {
                row.photo_path = nextPhotoPath;
            }

            linePayload.push(row);
        }

        const linesError = linePayload.length
            ? await insertDutyReportLines(linePayload)
            : null;

        if (linesError) {
            console.error(linesError);
            updateStatus('Nie udalo sie zapisac linii raportu.', 'error');
            if (saveButton) saveButton.disabled = false;
            return;
        }

        const devicePayload = [];
        for (const device of state.devices) {
            const draft = state.deviceDrafts.get(device.id);
            const photoPath = await uploadMeasureDevicePhoto(report.id, device.id, draft);
            if (photoPath === null && draft.photoFile) {
                warnings.push(`Brak zapisu zdjecia dla urzadzenia: ${device.name}.`);
            }

            const nextPhotoPath = photoPath || draft.photoPath || null;
            const row = {
                report_id: report.id,
                device_id: device.id,
                status: draft.status,
                note: draft.note.trim() || null,
                updated_at: report.created_at,
            };

            if (nextPhotoPath) {
                row.photo_path = nextPhotoPath;
            }

            devicePayload.push(row);
        }

        const deviceError = devicePayload.length
            ? await insertDutyMeasureStatuses(devicePayload)
            : null;

        if (deviceError) {
            console.error(deviceError);
            updateStatus('Nie udalo sie zapisac statusow urzadzen pomiarowych.', 'error');
            if (saveButton) saveButton.disabled = false;
            return;
        }

        state.latestReport = report;
        state.lineDrafts.forEach((draft) => {
            if (draft.photoFile) {
                draft.photoPath = linePayload.find((row) => row.item_id === draft.itemId)?.photo_path || draft.photoPath;
            }
            draft.photoFile = null;
            draft.photoFileName = '';
        });
        state.deviceDrafts.forEach((draft) => {
            if (draft.photoFile) {
                draft.photoPath = devicePayload.find((row) => row.device_id === draft.deviceId)?.photo_path || draft.photoPath;
            }
            draft.photoFile = null;
            draft.photoFileName = '';
        });

        applyLatestReportMeta();
        renderDutyTable();
        renderMeasureDeviceModal();
        closeMeasureDeviceModal();
        closeLineNoteModal();
        updateStatus(
            warnings.length
                ? `Raport zapisany. ${warnings.join(' ')}`
                : 'Raport zapisany.',
            warnings.length ? 'info' : 'success'
        );
        if (saveButton) saveButton.disabled = false;
    }

    async function uploadReportLinePhoto(reportId, itemId, draft) {
        if (!draft?.photoFile) {
            return draft?.photoPath || '';
        }

        const objectPath = `duty-report-lines/${reportId}/${itemId}-${Date.now()}-${sanitizeStorageSegment(draft.photoFile.name)}`;
        const { error } = await state.supabase.storage
            .from(STORAGE_BUCKET)
            .upload(objectPath, draft.photoFile, { upsert: true });

        if (error) {
            console.error(error);
            return null;
        }

        return `${STORAGE_BUCKET}/${objectPath}`;
    }

    async function uploadMeasureDevicePhoto(reportId, deviceId, draft) {
        if (!draft?.photoFile) {
            return draft?.photoPath || '';
        }

        const objectPath = `duty-measure-device/${reportId}/${deviceId}-${Date.now()}-${sanitizeStorageSegment(draft.photoFile.name)}`;
        const { error } = await state.supabase.storage
            .from(STORAGE_BUCKET)
            .upload(objectPath, draft.photoFile, { upsert: true });

        if (error) {
            console.error(error);
            return null;
        }

        return `${STORAGE_BUCKET}/${objectPath}`;
    }

    async function insertDutyReportLines(payload) {
        const { error } = await state.supabase.from('duty_report_lines').insert(payload);
        if (!isMissingSchemaColumnError(error, 'photo_path')) {
            return error;
        }

        const fallbackPayload = payload.map(({ photo_path, ...row }) => row);
        const retry = await state.supabase.from('duty_report_lines').insert(fallbackPayload);
        return retry.error;
    }

    async function insertDutyMeasureStatuses(payload) {
        const { error } = await state.supabase.from('duty_measure_device_status').insert(payload);
        if (!isMissingSchemaColumnError(error, 'photo_path')) {
            return error;
        }

        const fallbackPayload = payload.map(({ photo_path, ...row }) => row);
        const retry = await state.supabase.from('duty_measure_device_status').insert(fallbackPayload);
        return retry.error;
    }

    function isMissingSchemaColumnError(error, columnName) {
        if (!error || error.code !== 'PGRST204') {
            return false;
        }

        const message = String(error.message || '');
        return message.includes(`'${columnName}' column`);
    }

    function applyLatestReportMeta() {
        const meta = document.querySelector(selectors.meta);
        if (!meta) {
            return;
        }

        if (!state.latestReport) {
            meta.textContent = 'Brak zapisanego raportu. Wprowadz dane i zapisz pierwszy raport.';
            syncShiftCells('');
            return;
        }

        meta.textContent = `Ostatni raport: ${formatDateTime(state.latestReport.created_at)} | ${formatShiftLabel(state.latestReport.shift_code)}`;
        syncShiftCells(state.latestReport.shift_code);
    }

    function syncShiftCells(shiftValue = '') {
        document.querySelectorAll('[data-duty-shift-cell]').forEach((cell) => {
            cell.innerHTML = escapeHtml(formatShiftLabel(shiftValue));
        });
        document.querySelectorAll('[data-duty-date-cell]').forEach((cell) => {
            cell.innerHTML = escapeHtml(formatDateTime(state.latestReport?.created_at));
        });
    }

    function syncShiftLabel() {
        const label = document.querySelector(selectors.shiftLabel);
        if (!label) {
            return;
        }
        label.textContent = formatShiftLabel(getCurrentShiftCode());
    }

    function getCurrentShiftCode() {
        return String(state.profile?.shiftCode || '').trim();
    }

    function getDraftFileLabel(draft, emptyLabel) {
        return draft.photoFileName || extractFileName(draft.photoPath) || emptyLabel;
    }

    function normalizeLabel(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function toggleLoading(isLoading) {
        const loading = document.querySelector(selectors.loading);
        if (loading) {
            loading.hidden = !isLoading;
        }
    }

    function updateStatus(message, type = 'info') {
        const node = document.querySelector(selectors.status);
        if (!node) {
            return;
        }

        node.hidden = !message;
        node.textContent = message;
        node.className = 'duty-service__status';
        if (message) {
            node.classList.add(`duty-service__status--${type}`);
        }
    }

    function normalizeNonNegative(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return 0;
        }
        return Math.floor(parsed);
    }

    function sanitizeStorageSegment(value) {
        return String(value || '')
            .trim()
            .replace(/[^a-zA-Z0-9._-]+/g, '-');
    }

    function extractFileName(path) {
        if (!path) {
            return '';
        }
        const parts = String(path).split('/');
        return parts[parts.length - 1] || '';
    }

    function formatDateTime(value) {
        if (!value) {
            return '—';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }
        return date.toLocaleString('pl-PL');
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

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function triggerCameraInput(input) {
        if (!input) {
            return;
        }

        input.setAttribute('accept', 'image/*');
        input.setAttribute('capture', 'environment');

        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }

        input.click();
    }

    function syncBodyOverlayState() {
        const visibleOverlay = document.querySelector('.equipment-preview-overlay.is-visible');
        document.body.classList.toggle('has-equipment-preview', Boolean(visibleOverlay));
    }

    async function openCameraModal(context) {
        const overlay = document.querySelector(selectors.cameraOverlay);
        const video = document.querySelector(selectors.cameraVideo);
        if (!overlay || !video) {
            return;
        }

        state.cameraContext = context;

        if (!navigator.mediaDevices?.getUserMedia) {
            fallbackToFilePicker(context);
            return;
        }

        stopCameraStream();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            state.cameraStream = stream;
            video.srcObject = stream;
            overlay.hidden = false;
            overlay.classList.add('is-visible');
            document.body.classList.add('has-equipment-preview');
        } catch (error) {
            console.error('Blad uruchamiania aparatu:', error);
            fallbackToFilePicker(context);
        }
    }

    function closeCameraModal() {
        const overlay = document.querySelector(selectors.cameraOverlay);
        if (!overlay) {
            return;
        }
        overlay.hidden = true;
        overlay.classList.remove('is-visible');
        stopCameraStream();
        state.cameraContext = null;
        syncBodyOverlayState();
    }

    function stopCameraStream() {
        if (!state.cameraStream) {
            return;
        }
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;

        const video = document.querySelector(selectors.cameraVideo);
        if (video) {
            video.srcObject = null;
        }
    }

    async function captureCameraPhoto() {
        const video = document.querySelector(selectors.cameraVideo);
        const canvas = document.querySelector(selectors.cameraCanvas);
        if (!video || !canvas || !video.videoWidth || !video.videoHeight || !state.cameraContext) {
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context2d = canvas.getContext('2d');
        context2d.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) {
            return;
        }

        const fileName = `photo-${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        applyCapturedPhotoToDraft(state.cameraContext, file);
        closeCameraModal();
    }

    function applyCapturedPhotoToDraft(context, file) {
        if (!context || !file) {
            return;
        }

        if (context.type === 'line') {
            const draft = state.lineDrafts.get(context.itemId);
            if (!draft) {
                return;
            }
            draft.photoFile = file;
            draft.photoFileName = file.name;
            const label = document.querySelector(selectors.lineNoteFileName);
            if (label && state.activeLineNoteItemId === context.itemId) {
                label.textContent = getDraftFileLabel(draft, 'Brak zdjecia');
            }
            renderDutyTable();
            return;
        }

        if (context.type === 'device') {
            const draft = state.deviceDrafts.get(context.deviceId);
            if (!draft) {
                return;
            }
            draft.photoFile = file;
            draft.photoFileName = file.name;
            renderMeasureDeviceModal();
        }
    }

    function fallbackToFilePicker(context) {
        if (context?.type === 'line') {
            const input = document.querySelector(selectors.lineNoteFile);
            triggerCameraInput(input);
            return;
        }

        if (context?.type === 'device') {
            const input = document.querySelector(`[data-duty-device-photo="${context.deviceId}"]`);
            triggerCameraInput(input);
        }
    }
})();
