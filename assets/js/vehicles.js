// =========================================================
// Plik: assets/js/vehicles.js
// Logika strony "Listy Wozów":
// 1. Obsługa wyboru wozu i pobieranie danych z Supabase
// 2. Prezentacja skrytek oraz zaznaczanie sprzętu
// 3. Okno modalne z brakami i wysyłka przez WhatsApp
// =========================================================

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

    const VEHICLE_INFO = {
        '411-22': [
            { label: 'Nazwa', value: 'GBA 2,5/16' },
            { label: 'Woda', value: '2500' },
            { label: '\u015Ar. Pianotw\u00f3rczy', value: '250' },
        ],
        '411-25': [
            { label: 'Nazwa', value: 'GCBA 5/32' },
            { label: 'Woda', value: '5000' },
            { label: '\u015Ar. Pianotw\u00f3rczy', value: '500' },
        ],
        '411-23': [
            { label: 'Nazwa', value: 'GBA 3/16Pr 250 VOLVO' },
            { label: 'Woda', value: '3000' },
            { label: '\u015Ar. Pianotw\u00f3rczy', value: '325' },
            { label: 'Proszek', value: '250' },
            { label: 'Inf. dod.', value: 'System piany spr\u0119\u017Conej, CAFS 100l+110l' },
        ],
        '411-26': [
            { label: 'Nazwa', value: 'GCBA 5,2/53 SCANIA' },
            { label: 'Woda', value: '5240' },
            { label: '\u015Ar. Pianotw\u00f3rczy', value: '4130' },
        ],
    };

    const state = {
        supabase: null,
        user: null,
        profile: null,
        activeVehicle: null,
        activeVehicleButton: null,
        equipmentState: new Map(),
        inspectionDrafts: new Map(),
        openCompartmentBody: null,
        missingCache: [],
        issuesChannel: null,
        issuesRefreshTimerId: null,
    };

    const equipmentPreviewState = {
        overlay: null,
        title: null,
        meta: null,
        imageWrapper: null,
        image: null,
        fallback: null,
        notes: null,
        statusDamage: null,
        statusMissing: null,
        statusNormal: null,
        cameraStartButton: null,
        cameraCaptureButton: null,
        cameraVideo: null,
        cameraCanvas: null,
        photoName: null,
        saveButton: null,
        closeButton: null,
        closePreview: null,
        currentKey: null,
        pendingPhotoDataUrl: '',
        stream: null,
    };

    const selectors = {
        vehicleButtons: '[data-vehicle-code]',
        vehicleGrid: '.vehicle-grid',
        vehicleContent: '[data-vehicle-content]',
        vehicleTitle: '[data-selected-vehicle]',
        vehicleHint: '[data-vehicle-hint]',
        vehicleInfo: '[data-vehicle-info]',
        vehicleInfoToggle: '[data-vehicle-info-toggle]',
        vehicleInfoPanel: '[data-vehicle-info-panel]',
        vehicleInfoList: '[data-vehicle-info-list]',
        vehicleEmpty: '[data-vehicle-empty]',
        compartmentList: '[data-compartment-list]',
        sendMissing: '[data-action="send-missing"]',
        modalOverlay: '[data-missing-overlay]',
        modalPanel: '[data-missing-panel]',
        modalInfo: '[data-missing-info]',
        modalEmpty: '[data-missing-empty]',
        modalTable: '[data-missing-table]',
        modalTableBody: '[data-missing-list]',
        modalConfirm: '[data-action="confirm-missing"]',
        modalClose: '[data-action="close-missing"]',
    };

    const LONG_PRESS_DELAY_MS = 600;
    const EQUIPMENT_PREVIEW_DELAY_MS = 600;

    document.addEventListener('DOMContentLoaded', async () => {
        const {
            supabase,
            getCachedProfile,
            refreshProfile,
        } = window.AppCommon;

        state.supabase = supabase;
        state.profile = getCachedProfile();

        if (state.supabase) {
            const { data } = await state.supabase.auth.getSession();
            state.user = data.session?.user ?? null;
            if (!state.profile && state.user) {
                state.profile = await refreshProfile(state.user);
            }
        }

        const vehicleButtons = Array.from(document.querySelectorAll(selectors.vehicleButtons));
        vehicleButtons.forEach((button) => {
            button.addEventListener('click', () => handleVehicleClick(button));
        });

        document.querySelector(selectors.sendMissing)
            ?.addEventListener('click', handleSendMissingClick);

        document.querySelectorAll(selectors.modalClose)
            .forEach((button) => button.addEventListener('click', hideMissingModal));

        document.querySelector(selectors.modalConfirm)
            ?.addEventListener('click', handleConfirmMissingClick);

        setupVehicleInfoToggle();
        setupIssuesRealtimeSubscription();
    });

    async function handleVehicleClick(button) {
        const vehicleCode = button.dataset.vehicleCode;
        if (!vehicleCode) {
            return;
        }

        if (!state.supabase) {
            alert('Brak konfiguracji Supabase. Uzupełnij plik app-config.js.');
            return;
        }

        if (state.activeVehicleButton !== button) {
            state.activeVehicleButton?.classList.remove('is-active');
            button.classList.add('is-active');
            state.activeVehicleButton = button;
        }

        moveVehicleContentUnderButton(button);
        state.activeVehicle = vehicleCode;
        await loadVehicleData(vehicleCode);
    }

    function moveVehicleContentUnderButton(button) {
        const vehicleContent = document.querySelector(selectors.vehicleContent);
        const vehicleGrid = button.closest(selectors.vehicleGrid)
            || document.querySelector(selectors.vehicleGrid);

        if (!vehicleContent || !vehicleGrid) {
            return;
        }

        vehicleContent.classList.add('vehicle-content--inline');
        button.insertAdjacentElement('afterend', vehicleContent);
    }

    async function loadVehicleData(vehicleCode) {
        const tableName = VEHICLE_TABLES[vehicleCode];
        const vehicleContent = document.querySelector(selectors.vehicleContent);
        const title = document.querySelector(selectors.vehicleTitle);
        const hint = document.querySelector(selectors.vehicleHint);
        const empty = document.querySelector(selectors.vehicleEmpty);
        const compartmentList = document.querySelector(selectors.compartmentList);
        const sendButton = document.querySelector(selectors.sendMissing);

        if (!vehicleContent || !title || !hint || !empty || !compartmentList || !sendButton) {
            return;
        }

        vehicleContent.hidden = false;
        compartmentList.innerHTML = '';
        empty.hidden = true;
        hint.hidden = false;
        hint.textContent = 'Ładowanie danych ze skrytek...';
        sendButton.hidden = true;
        state.equipmentState.clear();
        state.openCompartmentBody = null;
        renderVehicleInfo(vehicleCode);

        if (!tableName) {
            title.textContent = `${vehicleCode} - brak powiązanej tabeli w Supabase.`;
            hint.textContent = 'Utwórz tabelę z wyposażeniem w Supabase, aby wyświetlić skrytki.';
            empty.hidden = false;
            return;
        }

        const { data, error } = await fetchVehicleData(tableName);
        if (error) {
            console.error(error);
            title.textContent = `${vehicleCode} - błąd podczas pobierania danych.`;
            hint.textContent = 'Sprawdź nazwę tabeli, uprawnienia oraz strukturę w Supabase.';
            empty.hidden = false;
            return;
        }

        title.textContent = `Wóz ${vehicleCode}`;

        if (!data || data.length === 0) {
            hint.textContent = 'Brak zdefiniowanych skrytek. Uzupełnij dane w Supabase.';
            empty.hidden = false;
            return;
        }

        const grouped = groupByCompartment(data);
        renderCompartments(grouped, compartmentList);
        await loadVehicleIssueStatuses(vehicleCode);

        hint.textContent = 'Kliknij element wyposażenia, aby oznaczyć go jako obecny (zielony). Przytrzymaj kontener (ramkę) w której znajduje się nazwa skrytki aby zaznaczyć WSZYSTKO na zielono. Jeśli dłużej przytrzymasz nazwę sprzętu wyświetlą się SZCZEGÓŁY.';
        hint.hidden = true;
        hint.textContent = '';
        sendButton.hidden = false;
    }

    function setupVehicleInfoToggle() {
        const toggle = document.querySelector(selectors.vehicleInfoToggle);
        if (!toggle) {
            return;
        }

        toggle.addEventListener('click', () => {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            setVehicleInfoExpanded(!isExpanded);
        });
    }

    function setVehicleInfoExpanded(isExpanded) {
        const toggle = document.querySelector(selectors.vehicleInfoToggle);
        const panel = document.querySelector(selectors.vehicleInfoPanel);
        if (!toggle || !panel) {
            return;
        }

        toggle.setAttribute('aria-expanded', String(isExpanded));
        panel.hidden = !isExpanded;
    }

    function renderVehicleInfo(vehicleCode) {
        const infoPanel = document.querySelector(selectors.vehicleInfo);
        const infoList = document.querySelector(selectors.vehicleInfoList);
        if (!infoPanel || !infoList) {
            return;
        }

        infoList.innerHTML = '';
        const details = VEHICLE_INFO[vehicleCode];
        if (!Array.isArray(details) || !details.length) {
            setVehicleInfoExpanded(false);
            infoPanel.hidden = true;
            return;
        }

        details.forEach(({ label, value }) => {
            const row = document.createElement('div');
            row.className = 'vehicle-info__row';

            const term = document.createElement('dt');
            term.className = 'vehicle-info__label';
            term.textContent = label;

            const description = document.createElement('dd');
            description.className = 'vehicle-info__value';
            description.textContent = value;

            row.append(term, description);
            infoList.appendChild(row);
        });

        setVehicleInfoExpanded(false);
        infoPanel.hidden = false;
    }

    async function fetchVehicleData(tableName) {
        if (!state.supabase) {
            return { data: null, error: new Error('Missing Supabase client') };
        }

        let query = await state.supabase
            .from(tableName)
            .select('*')
            .order('position', { ascending: true, nullsLast: true })
            .order('created_at', { ascending: true, nullsLast: true });

        if (query.error && query.error.code === '42703') {
            query = await state.supabase
                .from(tableName)
                .select('*')
                .order('created_at', { ascending: true, nullsLast: true });
        }
        return query;
    }

    function groupByCompartment(rows) {
        const grouped = new Map();

        rows.forEach((row, index) => {
            const compartment = (row.compartment ?? row['compartment']) || 'Nieoznaczona skrytka';
            const equipment = (row.equipment_name ?? row['SPRZĘT'] ?? row['sprzęt']) || 'Sprzęt bez nazwy';
            const quantityRaw = row.quantity ?? row['ILOŚĆ'] ?? row['ilość'];
            const quantity = quantityRaw === undefined || quantityRaw === null ? '' : String(quantityRaw).trim();
            const imageUrl = row.img ?? row['img'] ?? row['IMG'] ?? '';
            const equipmentId = row.equipment_id ?? row['equipment_id'] ?? row.id ?? row['id'] ?? null;

            const key = `${compartment}__${equipment}__${index}`;
            state.equipmentState.set(key, {
                equipmentId,
                compartment,
                equipment,
                quantity,
                imageUrl,
                checked: false,
                element: null,
            });

            if (!grouped.has(compartment)) {
                grouped.set(compartment, []);
            }
            grouped.get(compartment).push({ key, equipment, quantity, imageUrl });
        });

        return grouped;
    }

    function setupIssuesRealtimeSubscription() {
        if (!state.supabase || state.issuesChannel) {
            return;
        }

        state.issuesChannel = state.supabase
            .channel('vehicle-equipment-issues')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'equipment_issue_status',
                },
                () => {
                    if (!state.activeVehicle) {
                        return;
                    }

                    if (state.issuesRefreshTimerId) {
                        window.clearTimeout(state.issuesRefreshTimerId);
                    }

                    state.issuesRefreshTimerId = window.setTimeout(() => {
                        state.issuesRefreshTimerId = null;
                        loadVehicleIssueStatuses(state.activeVehicle);
                    }, 150);
                }
            )
            .subscribe();
    }

    async function loadVehicleIssueStatuses(vehicleCode) {
        if (!state.supabase || !vehicleCode) {
            return;
        }

        const { data, error } = await state.supabase
            .from('equipment_issue_status')
            .select('equipment_id, status, note, updated_at')
            .eq('vehicle_code', vehicleCode);

        if (error) {
            console.error('Nie udalo sie pobrac statusow sprzetu:', error);
            return;
        }

        const issuesByEquipmentId = new Map();
        (data || []).forEach((row) => {
            if (!row.equipment_id) {
                return;
            }

            issuesByEquipmentId.set(row.equipment_id, {
                notes: row.note || '',
                status: row.status === 'broken' ? 'Uszkodzony' : 'Brak',
                photoName: '',
                updatedAt: row.updated_at || '',
            });
        });

        state.inspectionDrafts.clear();
        state.equipmentState.forEach((record, key) => {
            const issue = record.equipmentId ? issuesByEquipmentId.get(record.equipmentId) : null;
            if (issue) {
                state.inspectionDrafts.set(key, issue);
            }
            record.element?.classList.toggle('equipment-item--reported', Boolean(issue));
        });
    }

    function ensureEquipmentPreviewElements() {
        if (equipmentPreviewState.overlay) {
            return equipmentPreviewState;
        }

        const overlay = document.createElement('div');
        overlay.className = 'equipment-preview-overlay';
        overlay.dataset.equipmentPreviewOverlay = 'true';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-hidden', 'true');

        overlay.innerHTML = `
            <div class="equipment-preview equipment-preview--report" role="document">
                <header class="equipment-preview__header">
                    <div class="equipment-preview__heading">
                        <h2 class="equipment-preview__title"></h2>
                        <p class="equipment-preview__meta" data-equipment-preview-meta></p>
                    </div>
                    <button type="button" class="equipment-preview__close" data-action="close-preview" aria-label="Zamknij podgląd">
                        <span aria-hidden="true">×</span>
                    </button>
                </header>
                <div class="equipment-preview__body">
                    <div class="equipment-preview__content">
                        <div class="equipment-preview__image" data-equipment-preview-image-wrapper>
                            <img src="" alt="" data-equipment-preview-image />
                        </div>
                        <div class="equipment-preview__notes">
                            <label for="equipment-preview-notes">Uwagi</label>
                            <textarea id="equipment-preview-notes" data-equipment-preview-notes placeholder="Wpisz uwagi do sprzętu..."></textarea>
                            <fieldset class="equipment-preview__status">
                                <legend>Status</legend>
                                <label><input type="checkbox" name="equipment-preview-status-damage" value="Uszkodzony" data-equipment-preview-status-damage /> Uszkodzony</label>
                                <label><input type="checkbox" name="equipment-preview-status-missing" value="Brak" data-equipment-preview-status-missing /> Brak</label>
                                <label><input type="checkbox" name="equipment-preview-status-normal" value="W normie" data-equipment-preview-status-normal /> W normie</label>
                            </fieldset>
                        </div>
                    </div>
                    <p class="equipment-preview__fallback" data-equipment-preview-fallback hidden></p>
                    <label class="equipment-preview__photo-label">Zdjęcie z aparatu</label>
                    <button type="button" class="btn btn--ghost equipment-preview__camera-start" data-action="start-preview-camera">Dodaj zdjęcie</button>
                    <div class="equipment-preview__camera" hidden>
                        <video class="equipment-preview__video" autoplay playsinline muted data-equipment-preview-video></video>
                        <canvas class="equipment-preview__canvas" data-equipment-preview-canvas hidden></canvas>
                        <button type="button" class="btn btn--ghost equipment-preview__camera-capture" data-action="capture-preview-photo">Zrób zdjęcie</button>
                    </div>
                    <p class="equipment-preview__photo-name" data-equipment-preview-photo-name>Nie zrobiono zdjęcia.</p>
                    <div class="equipment-preview__actions">
                        <button type="button" class="btn btn--primary" data-action="save-preview">Zapisz</button>
                    </div>
                </div>
            </div>
        `;

        const title = overlay.querySelector('.equipment-preview__title');
        const meta = overlay.querySelector('[data-equipment-preview-meta]');
        const imageWrapper = overlay.querySelector('[data-equipment-preview-image-wrapper]');
        const image = overlay.querySelector('[data-equipment-preview-image]');
        const fallback = overlay.querySelector('[data-equipment-preview-fallback]');
        const notes = overlay.querySelector('[data-equipment-preview-notes]');
        const statusDamage = overlay.querySelector('[data-equipment-preview-status-damage]');
        const statusMissing = overlay.querySelector('[data-equipment-preview-status-missing]');
        const statusNormal = overlay.querySelector('[data-equipment-preview-status-normal]');
        const cameraStartButton = overlay.querySelector('[data-action="start-preview-camera"]');
        const cameraCaptureButton = overlay.querySelector('[data-action="capture-preview-photo"]');
        const cameraWrap = overlay.querySelector('.equipment-preview__camera');
        const cameraVideo = overlay.querySelector('[data-equipment-preview-video]');
        const cameraCanvas = overlay.querySelector('[data-equipment-preview-canvas]');
        const photoName = overlay.querySelector('[data-equipment-preview-photo-name]');
        const saveButton = overlay.querySelector('[data-action="save-preview"]');
        const closeButton = overlay.querySelector('[data-action="close-preview"]');

        const closePreview = () => {
            stopPreviewCamera();
            overlay.classList.remove('is-visible');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('has-equipment-preview');
            equipmentPreviewState.currentKey = null;
            equipmentPreviewState.pendingPhotoDataUrl = '';
            cameraWrap.hidden = true;
            cameraStartButton.hidden = false;
        };

        closeButton.addEventListener('click', closePreview);
        saveButton.addEventListener('click', saveEquipmentIssue);
        cameraStartButton.addEventListener('click', async () => {
            const started = await startPreviewCamera();
            cameraWrap.hidden = !started;
            cameraStartButton.hidden = started;
        });
        cameraCaptureButton.addEventListener('click', () => {
            if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
                return;
            }
            cameraCanvas.width = cameraVideo.videoWidth;
            cameraCanvas.height = cameraVideo.videoHeight;
            const ctx = cameraCanvas.getContext('2d');
            ctx.drawImage(cameraVideo, 0, 0);
            equipmentPreviewState.pendingPhotoDataUrl = cameraCanvas.toDataURL('image/jpeg', 0.9);
            photoName.textContent = 'Zdjęcie wykonane aparatem.';
            stopPreviewCamera();
            cameraWrap.hidden = true;
            cameraStartButton.hidden = false;
        });

        statusDamage.addEventListener('change', () => syncPreviewStatusSelection('damage'));
        statusMissing.addEventListener('change', () => syncPreviewStatusSelection('missing'));
        statusNormal.addEventListener('change', () => syncPreviewStatusSelection('normal'));

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closePreview();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('is-visible')) {
                closePreview();
            }
        });

        document.body.appendChild(overlay);

        equipmentPreviewState.overlay = overlay;
        equipmentPreviewState.title = title;
        equipmentPreviewState.meta = meta;
        equipmentPreviewState.imageWrapper = imageWrapper;
        equipmentPreviewState.image = image;
        equipmentPreviewState.fallback = fallback;
        equipmentPreviewState.notes = notes;
        equipmentPreviewState.statusDamage = statusDamage;
        equipmentPreviewState.statusMissing = statusMissing;
        equipmentPreviewState.statusNormal = statusNormal;
        equipmentPreviewState.cameraStartButton = cameraStartButton;
        equipmentPreviewState.cameraCaptureButton = cameraCaptureButton;
        equipmentPreviewState.cameraVideo = cameraVideo;
        equipmentPreviewState.cameraCanvas = cameraCanvas;
        equipmentPreviewState.photoName = photoName;
        equipmentPreviewState.saveButton = saveButton;
        equipmentPreviewState.closeButton = closeButton;
        equipmentPreviewState.closePreview = closePreview;

        return equipmentPreviewState;
    }

    async function startPreviewCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Aparat nie jest dostępny w tej przeglądarce.');
            return false;
        }
        stopPreviewCamera();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            equipmentPreviewState.stream = stream;
            equipmentPreviewState.cameraVideo.srcObject = stream;
            return true;
        } catch (error) {
            console.error('Błąd uruchamiania aparatu:', error);
            alert('Nie udało się uruchomić aparatu.');
            return false;
        }
    }

    function stopPreviewCamera() {
        const stream = equipmentPreviewState.stream;
        if (!stream) {
            return;
        }
        stream.getTracks().forEach((track) => track.stop());
        equipmentPreviewState.stream = null;
        if (equipmentPreviewState.cameraVideo) {
            equipmentPreviewState.cameraVideo.srcObject = null;
        }
    }

    function openEquipmentModal(item) {
        const stateKey = typeof item === 'string' ? item : item?.key;
        const record = state.equipmentState.get(stateKey);
        if (!record) {
            return;
        }

        const {
            overlay,
            title,
            meta,
            imageWrapper,
            image,
            fallback,
            notes,
            statusDamage,
            statusMissing,
            statusNormal,
            cameraStartButton,
            cameraCaptureButton,
            photoName,
        } = ensureEquipmentPreviewElements();

        equipmentPreviewState.currentKey = stateKey;
        equipmentPreviewState.pendingPhotoDataUrl = '';

        overlay.classList.remove('equipment-preview--fallback');
        imageWrapper.hidden = false;
        fallback.hidden = true;
        fallback.textContent = '';

        title.textContent = record.equipment;
        meta.textContent = `Wóz: ${state.activeVehicle || '-'} | Skrytka: ${record.compartment || '-'}`;

        const draft = state.inspectionDrafts.get(stateKey) || {};
        notes.value = draft.notes || '';
        applyPreviewStatusDraft(draft.status || '');
        photoName.textContent = draft.photoName ? `Zdjęcie: ${draft.photoName}` : 'Nie zrobiono zdjęcia.';
        cameraStartButton.hidden = false;
        cameraCaptureButton.parentElement.hidden = true;

        image.alt = record.equipment;

        if (record.imageUrl) {
            image.onload = () => {
                overlay.classList.remove('equipment-preview--fallback');
                imageWrapper.hidden = false;
                fallback.hidden = true;
            };

            image.onerror = () => {
                overlay.classList.add('equipment-preview--fallback');
                imageWrapper.hidden = true;
                fallback.hidden = false;
                fallback.textContent = `Nie udało się wczytać obrazu z adresu ${record.imageUrl}.`;
            };

            image.src = record.imageUrl;
        } else {
            image.removeAttribute('src');
            overlay.classList.add('equipment-preview--fallback');
            imageWrapper.hidden = true;
            fallback.hidden = false;
            fallback.textContent = `Brak zdjęcia dla "${record.equipment}".`;
        }

        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('has-equipment-preview');
    }

    async function saveEquipmentIssue() {
        const {
            currentKey,
            notes,
            statusDamage,
            statusMissing,
            statusNormal,
            photoName,
            pendingPhotoDataUrl,
            closePreview,
        } = equipmentPreviewState;

        if (!currentKey) {
            return;
        }

        const record = state.equipmentState.get(currentKey);
        if (!record) {
            return;
        }
        if (!record.equipmentId) {
            alert('Ten sprzęt nie ma equipment_id. Nie można zapisać statusu.');
            return;
        }
        if (!state.supabase) {
            alert('Brak połączenia z Supabase.');
            return;
        }

        const shiftCode = String(state.profile?.shiftCode || '').trim();
        if (!shiftCode) {
            alert('Brak przypisanego shift_code dla zalogowanego uzytkownika.');
            return;
        }

        const status = statusDamage.checked
            ? 'Uszkodzony'
            : statusMissing.checked
                ? 'Brak'
                : statusNormal.checked
                    ? 'W normie'
                : '';

        if (!status) {
            alert('Wybierz status: Uszkodzony, Brak albo W normie.');
            return;
        }

        const previousDraft = state.inspectionDrafts.get(currentKey) || {};
        const { data: existingIssue } = await state.supabase
            .from('equipment_issue_status')
            .select('issue_photo_path')
            .eq('equipment_id', record.equipmentId)
            .maybeSingle();

        const existingPath = existingIssue?.issue_photo_path || '';
        const existingObjectPath = existingPath.startsWith('issue-photos/')
            ? existingPath.replace('issue-photos/', '')
            : existingPath;

        if (status === 'W normie') {
            await state.supabase
                .from('equipment_issue_status')
                .delete()
                .eq('equipment_id', record.equipmentId);

            if (existingObjectPath) {
                await state.supabase.storage.from('issue-photos').remove([existingObjectPath]);
            }

            state.inspectionDrafts.set(currentKey, {
                notes: '',
                status: 'W normie',
                photoName: '',
            });
            record.element?.classList.remove('equipment-item--reported');
            photoName.textContent = 'Nie zrobiono zdjęcia.';
            alert('Status ustawiony na W normie. Rekord został usunięty.');
            closePreview();
            return;
        }

        let issuePhotoPath = existingPath || '';
        if (pendingPhotoDataUrl) {
            const blob = dataUrlToBlob(pendingPhotoDataUrl);
            const objectPath = `${sanitizeStorageSegment(shiftCode)}/${record.equipmentId}.jpg`;
            await state.supabase.storage.from('issue-photos').remove([objectPath]);
            const { error: uploadError } = await state.supabase.storage
                .from('issue-photos')
                .upload(objectPath, blob, { contentType: 'image/jpeg', upsert: true });

            if (uploadError) {
                console.error(uploadError);
                alert('Nie udało się zapisać zdjęcia.');
                return;
            }
            issuePhotoPath = `issue-photos/${objectPath}`;
        }

        const dbStatus = status === 'Uszkodzony' ? 'broken' : 'missing';
        const payload = {
            equipment_id: record.equipmentId,
            equipment_name: record.equipment,
            vehicle_code: state.activeVehicle || '',
            compartment_code: record.compartment || '',
            shift_code: shiftCode,
            status: dbStatus,
            note: notes.value.trim() || null,
            issue_photo_path: issuePhotoPath || null,
            updated_at: new Date().toISOString(),
        };

        let upsertError = null;
        const upsertResult = await state.supabase
            .from('equipment_issue_status')
            .upsert(payload, { onConflict: 'equipment_id' });
        upsertError = upsertResult.error;

        if (upsertError) {
            const fallbackResult = await saveEquipmentIssueFallback(record.equipmentId, payload);
            upsertError = fallbackResult.error;
        }

        if (upsertError) {
            console.error(upsertError);
            alert('Nie udało się zapisać statusu.');
            return;
        }

        const nextDraft = {
            notes: payload.note || '',
            status,
            photoName: pendingPhotoDataUrl ? 'z aparatu' : (previousDraft.photoName || ''),
        };
        state.inspectionDrafts.set(currentKey, nextDraft);

        if (record?.element) {
            const hasAnyData = Boolean(nextDraft.notes || nextDraft.status || nextDraft.photoName);
            record.element.classList.toggle('equipment-item--reported', hasAnyData);
        }

        photoName.textContent = nextDraft.photoName ? `Zdjęcie: ${nextDraft.photoName}` : 'Nie zrobiono zdjęcia.';
        alert('Zapisano status sprzętu.');
        closePreview();
    }

    function dataUrlToBlob(dataUrl) {
        const [meta, base64] = dataUrl.split(',');
        const mimeMatch = /data:(.*?);base64/.exec(meta || '');
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const binary = atob(base64 || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
    }

    async function saveEquipmentIssueFallback(equipmentId, payload) {
        const { data: existingRows, error: existingError } = await state.supabase
            .from('equipment_issue_status')
            .select('id')
            .eq('equipment_id', equipmentId)
            .order('updated_at', { ascending: false })
            .limit(1);

        if (existingError) {
            return { error: existingError };
        }

        const existingId = Array.isArray(existingRows) && existingRows.length
            ? existingRows[0].id
            : null;

        if (existingId) {
            const { error } = await state.supabase
                .from('equipment_issue_status')
                .update(payload)
                .eq('id', existingId);
            return { error };
        }

        const { error } = await state.supabase
            .from('equipment_issue_status')
            .insert(payload);
        return { error };
    }

    function applyPreviewStatusDraft(status) {
        const { statusDamage, statusMissing, statusNormal } = equipmentPreviewState;
        statusDamage.checked = status === 'Uszkodzony';
        statusMissing.checked = status === 'Brak';
        statusNormal.checked = status === 'W normie';
    }

    function syncPreviewStatusSelection(selectedType) {
        const { statusDamage, statusMissing, statusNormal } = equipmentPreviewState;
        const nextState = {
            damage: false,
            missing: false,
            normal: false,
        };

        if (selectedType === 'damage' && statusDamage.checked) {
            nextState.damage = true;
        }
        if (selectedType === 'missing' && statusMissing.checked) {
            nextState.missing = true;
        }
        if (selectedType === 'normal' && statusNormal.checked) {
            nextState.normal = true;
        }

        statusDamage.checked = nextState.damage;
        statusMissing.checked = nextState.missing;
        statusNormal.checked = nextState.normal;
    }

    function sanitizeStorageSegment(value) {
        return String(value || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '-');
    }

    function renderCompartments(grouped, container) {
        container.innerHTML = '';

        grouped.forEach((items, compartment) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'compartment';

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'compartment__toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = `<span>${compartment}</span><span>${items.length} pozycji</span>`;

            const body = document.createElement('div');
            body.className = 'compartment__body';
            body.hidden = true;

            const list = document.createElement('ul');
            list.className = 'equipment-list';

            items.forEach(({ key, equipment, quantity }) => {
                const item = document.createElement('li');
                item.className = 'equipment-item';
                item.dataset.stateKey = key;
                item.innerHTML = `
                    <span class="equipment-item__name">${equipment}</span>
                    <span class="equipment-item__qty">${quantity || 'brak'}</span>
                `;
                let previewTimerId = null;
                let previewTriggered = false;

                const cancelPreviewTimer = () => {
                    if (previewTimerId !== null) {
                        window.clearTimeout(previewTimerId);
                        previewTimerId = null;
                    }
                };

                const schedulePreview = () => {
                    cancelPreviewTimer();
                    previewTimerId = window.setTimeout(() => {
                        previewTimerId = null;
                        previewTriggered = true;
                        openEquipmentModal({ key });
                    }, EQUIPMENT_PREVIEW_DELAY_MS);
                };

                item.addEventListener('pointerdown', (event) => {
                    if (typeof event.button === 'number' && event.button !== 0) {
                        return;
                    }
                    previewTriggered = false;
                    schedulePreview();
                });
                item.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                });

                const clearPreviewState = () => {
                    cancelPreviewTimer();
                };

                item.addEventListener('pointerup', clearPreviewState);
                item.addEventListener('pointerleave', clearPreviewState);
                item.addEventListener('pointercancel', clearPreviewState);

                item.addEventListener('click', (event) => {
                    if (previewTriggered) {
                        event.preventDefault();
                        previewTriggered = false;
                        return;
                    }
                    toggleEquipmentItem(key, item);
                });

                list.appendChild(item);

                const record = state.equipmentState.get(key);
                if (record) {
                    record.element = item;
                }
            });

            body.appendChild(list);
            wrapper.appendChild(toggle);
            wrapper.appendChild(body);
            container.appendChild(wrapper);

            const openCompartment = () => {
                if (state.openCompartmentBody && state.openCompartmentBody !== body) {
                    state.openCompartmentBody.hidden = true;
                    state.openCompartmentBody.previousSibling?.setAttribute('aria-expanded', 'false');
                }
                body.hidden = false;
                toggle.setAttribute('aria-expanded', 'true');
                state.openCompartmentBody = body;
            };

            const closeCompartment = () => {
                body.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
                if (state.openCompartmentBody === body) {
                    state.openCompartmentBody = null;
                }
            };

            const markAllItemsInCompartment = () => {
                items.forEach(({ key }) => {
                    const record = state.equipmentState.get(key);
                    if (!record) {
                        return;
                    }
                    record.checked = true;
                    record.element?.classList.add('is-checked');
                    state.equipmentState.set(key, record);
                });
            };

            let longPressTimerId = null;
            let longPressTriggered = false;

            const cancelLongPressTimer = () => {
                if (longPressTimerId !== null) {
                    window.clearTimeout(longPressTimerId);
                    longPressTimerId = null;
                }
            };

            const scheduleLongPress = () => {
                cancelLongPressTimer();
                longPressTimerId = window.setTimeout(() => {
                    longPressTimerId = null;
                    longPressTriggered = true;
                    openCompartment();
                    markAllItemsInCompartment();
                }, LONG_PRESS_DELAY_MS);
            };

            const handlePointerDown = (event) => {
                if (typeof event.button === 'number' && event.button !== 0) {
                    return;
                }
                longPressTriggered = false;
                scheduleLongPress();
            };

            const handlePointerEnd = () => {
                cancelLongPressTimer();
            };

            toggle.addEventListener('pointerdown', handlePointerDown);
            toggle.addEventListener('pointerup', handlePointerEnd);
            toggle.addEventListener('pointerleave', handlePointerEnd);
            toggle.addEventListener('pointercancel', handlePointerEnd);
            toggle.addEventListener('contextmenu', (event) => {
                event.preventDefault();
            });

            toggle.addEventListener('click', (event) => {
                if (longPressTriggered) {
                    event.preventDefault();
                    longPressTriggered = false;
                    return;
                }

                if (body.hidden) {
                    openCompartment();
                } else {
                    closeCompartment();
                }
            });
        });
    }

    function toggleEquipmentItem(key, element) {
        const record = state.equipmentState.get(key);
        if (!record) {
            return;
        }
        record.checked = !record.checked;
        element.classList.toggle('is-checked', record.checked);
        state.equipmentState.set(key, record);
    }

    function handleSendMissingClick() {
        if (!state.activeVehicle) {
            alert('Najpierw wybierz wóz.');
            return;
        }

        const missing = collectMissingItems();
        state.missingCache = missing;
        showMissingModal(missing);
    }

    function collectMissingItems() {
        const missing = [];
        state.equipmentState.forEach((record) => {
            if (!record.checked) {
                missing.push({
                    vehicle: state.activeVehicle,
                    compartment: record.compartment,
                    equipment: record.equipment,
                    quantity: record.quantity,
                });
            }
        });
        return missing;
    }

    function showMissingModal(missing) {
        const overlay = document.querySelector(selectors.modalOverlay);
        const panel = document.querySelector(selectors.modalPanel);
        const info = document.querySelector(selectors.modalInfo);
        const empty = document.querySelector(selectors.modalEmpty);
        const table = document.querySelector(selectors.modalTable);
        const tbody = document.querySelector(selectors.modalTableBody);

        if (!overlay || !panel || !info || !empty || !table || !tbody) {
            return;
        }

        tbody.innerHTML = '';

        if (!missing.length) {
            empty.hidden = false;
            table.hidden = true;
            info.textContent = 'Wóz ma oznaczony cały sprzęt. Nic nie zostanie wysłane.';
        } else {
            empty.hidden = true;
            table.hidden = false;
            info.textContent = 'Sprawdź listę braków. Po potwierdzeniu zostaną wysłane przez WhatsApp.';

            missing.forEach((item) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.compartment}</td>
                    <td>${item.equipment}</td>
                    <td>${item.quantity || 'brak danych'}</td>
                `;
                tbody.appendChild(row);
            });
        }

        overlay.hidden = false;
        panel.hidden = false;
    }

    function hideMissingModal() {
        document.querySelector(selectors.modalOverlay)?.setAttribute('hidden', 'true');
        document.querySelector(selectors.modalPanel)?.setAttribute('hidden', 'true');
    }

    async function handleConfirmMissingClick() {
        if (!state.activeVehicle) {
            alert('Najpierw wybierz wóz.');
            return;
        }

        const missing = state.missingCache || [];
        if (!missing.length) {
            alert('Brak pozycji do wysłania.');
            hideMissingModal();
            return;
        }

        const whatsappMessage = buildWhatsappMessage(missing);
        openWhatsappWithMessage(whatsappMessage);

        resetSelections();
        hideMissingModal();
    }

    function buildWhatsappMessage(missing) {
        const lines = [];
        lines.push(`Braki - wóz ${state.activeVehicle}`);
        missing.forEach((item) => {
            lines.push(`- ${item.compartment}: ${item.equipment} (${item.quantity || 'brak ilości'})`);
        });
        return lines.join('\n');
    }

    function openWhatsappWithMessage(message) {
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    function resetSelections() {
        state.equipmentState.forEach((record, key) => {
            record.checked = false;
            record.element?.classList.remove('is-checked');
            state.equipmentState.set(key, record);
        });
        state.missingCache = [];
    }

    window.openEquipmentModal = openEquipmentModal;
    window.saveEquipmentIssue = saveEquipmentIssue;
})();
