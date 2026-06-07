/**
 * PHDU Critical Items entry wizard — mirrors Google Form questions & dropdowns.
 */
(function(){
  'use strict';

  const PHDU_FORM = {
    movementHint: 'This section indicates whether the item was <strong>received into stock</strong> or <strong>consumed/used</strong>. Select the appropriate option for each entry.',
    categories: ['Airway Items', 'PPE', 'Hygienic Items', 'Patient Care', 'Procedure Items', 'Machine'],
    airwayItems: ['Tracheostomy', 'ET', 'Swedish Nose'],
    trachItems: ['Accessory', 'Tracheostomy Tube'],
    trachAccessories: ['Tracheostomy Polymem Dressing', 'Tracheostomy Tie', 'Swedish Nose'],
    trachTypeCategories: ['Neonate', 'Pediatric'],
    tubeTypes: ['Cuffed', 'Uncuffed'],
    tubeSizes: ['2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'],
    tubeWhere: ['Office Store', 'PW1', 'PW2', 'PW3', 'PW4', 'Pead Onco', 'PICU', 'PER', 'PHDU'],
    ppeItems: ['Option 1'],
    hygienicItems: ['Option 1'],
    procedureItems: ['Option 1'],
    patientCareItems: [
      'Masimo Saturation Probe Infant',
      'Masimo Saturation Probe Pediatric',
      'Disposable Electrode Neonatal',
      'Disposable Electrode Pediatric'
    ],
    machines: [
      'Ventilator', 'Suctioning Machine', 'Pulse ox', 'Nebulizer Machine',
      'Feeding Pump', 'Oxygen clinder', 'Oxygen concentrator'
    ],
    biomedPresets: ['No Biomed Number'],
    deviceStatus: ['New', 'Old Used Returned from patient'],
    deviceStatusDesc: [
      'Under maintenance', 'Damaged', 'Missing accessory',
      'Waiting for Biomed check', 'Ready to use'
    ],
    deviceLocation: [
      'Issued to patient', 'Sent to Biomed', 'Sent to company',
      'With Home Ventilation Nurse', 'With RT', 'With Doctor',
      'Returned to social worker', 'Discarded / Condemned'
    ],
    actions: ['Received stock', 'Consumed', 'Not available'],
    stockMethods: [
      'Indented from RH store', 'Barrowed from other Hospital',
      'Barrowed from other wards', 'Return as item not used for patient'
    ],
    consumeMethods: [
      'Used for pt', 'given to another ward', 'given to another hospital',
      'Removed as expired', 'Return to store'
    ]
  };

  const PENDING_ENTRIES_KEY = 'criticalInventoryPendingEntries';
  let entryFormState = {};
  let entryWizardStepIndex = 0;
  let entryWizardSubmitting = false;

  function pad2(n){ return String(n).padStart(2, '0'); }

  function formatDateForSheet(date){
    if(!date || Number.isNaN(date.getTime())) return '';
    return pad2(date.getDate()) + '/' + pad2(date.getMonth() + 1) + '/' + date.getFullYear();
  }

  function isoDateToSheet(iso){
    if(!iso) return '';
    const parts = iso.split('-');
    if(parts.length !== 3) return iso;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function sheetDateToIso(sheetDate){
    const d = parseReportDate(sheetDate);
    if(!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function defaultEntryFormState(){
    return {
      date: formatDateForSheet(new Date()),
      category: '', airwayItem: '', trachItem: '', trachAccessory: '',
      trachTypeCategory: '', tubeType: '', tubeSize: '', tubeWhere: '',
      ppeItem: '', hygienicItem: '', procedureItem: '', patientCareItem: '',
      machine: '', deviceBrand: '', biomedPreset: '', biomedNumber: '',
      deviceStatus: '', deviceStatusDesc: '', deviceLocation: '', lastServiceDate: '',
      action: '', stockMethod: '', indentNumber: '', consumeMethod: '',
      quantity: '', expiryDate: '', incidentNumber: '', barwaNumber: ''
    };
  }

  function getEntryWizardSteps(state){
    const steps = [{ id: 'intro', title: 'Date & Category', section: 'PHDU Critical Items' }];

    if(state.category === 'Machine'){
      steps.push({ id: 'machine_pick', title: 'Select Machine', section: 'Machine Items' });
      steps.push({ id: 'machine_status', title: 'Machine Status', section: 'Machine Status' });
      steps.push({ id: 'machine_where', title: 'where', section: 'where' });
    }else if(state.category === 'Airway Items'){
      steps.push({ id: 'airway', title: 'Selected item Airway', section: 'Airway Items' });
      if(state.airwayItem === 'Tracheostomy'){
        steps.push({ id: 'trach_pick', title: 'Select item of Tracheostomy', section: 'Select item of Tracheostomy' });
        if(state.trachItem === 'Accessory'){
          steps.push({ id: 'trach_accessory', title: 'Accessory for Tracheostomy', section: 'Accessory for Tracheostomy' });
          steps.push({ id: 'trach_where_acc', title: 'where', section: 'where' });
        }else if(state.trachItem === 'Tracheostomy Tube'){
          steps.push({ id: 'trach_tube', title: 'Tracheostomy Tube details', section: 'Type of the Tracheostomy' });
          steps.push({ id: 'trach_where', title: 'where', section: 'where' });
        }
      }
    }else if(state.category === 'PPE'){
      steps.push({ id: 'ppe', title: 'Selected item PPE', section: 'PPE Item' });
    }else if(state.category === 'Hygienic Items'){
      steps.push({ id: 'hygienic', title: 'Selected item Hygienic Items', section: 'Hygienic Items' });
    }else if(state.category === 'Procedure Items'){
      steps.push({ id: 'procedure', title: 'Selected item Procedure Items', section: 'Procedure Items' });
    }else if(state.category === 'Patient Care'){
      steps.push({ id: 'patient_care', title: 'Selected item Patient Care', section: 'Patient Care' });
    }

    steps.push({ id: 'movement', title: 'Was the item received or consumed?', section: 'Item Movement (Received or Consumed)' });

    if(state.action === 'Received stock'){
      steps.push({ id: 'receiving', title: 'How was stock added?', section: 'Receiving Status' });
      steps.push({ id: 'counting', title: 'Quantity & Expiry', section: 'counting the stock' });
    }else if(state.action === 'Consumed'){
      steps.push({ id: 'consumed', title: 'How was the item consumed?', section: 'Consumed' });
      steps.push({ id: 'counting', title: 'Quantity & Expiry', section: 'counting the stock' });
    }else if(state.action === 'Not available'){
      steps.push({ id: 'not_available', title: 'Incident / Barwa', section: 'Item not available' });
    }

    steps.push({ id: 'review', title: 'Review & Submit', section: 'Submit' });
    return steps;
  }

  function entryStepPanel(title, innerHtml){
    return '<div class="entry-step-panel">' +
      (title ? '<div class="entry-step-panel-head"><h3>' + escapeReportText(title) + '</h3></div>' : '') +
      '<div class="entry-step-panel-body">' + innerHtml + '</div></div>';
  }

  function entrySection(title, hint){
    let html = '';
    if(title) html += '<div class="entry-section-title">' + escapeReportText(title) + '</div>';
    if(hint) html += '<p class="entry-field-hint">' + hint + '</p>';
    return html;
  }

  function entryChoiceCards(label, field, options, required, value, gridClass){
    const name = 'entry_' + field;
    const gridCls = 'entry-choice-grid' + (gridClass ? ' ' + gridClass : '');
    return '<div class="entry-question"><div class="entry-question-label">' + escapeReportText(label) +
      (required ? ' <span class="req">*</span>' : '') + '</div><div class="' + gridCls + '">' +
      options.map(function(opt){
        const checked = String(value) === String(opt);
        return '<label class="entry-choice-card' + (checked ? ' selected' : '') + '">' +
          '<input type="radio" name="' + name + '" data-entry-field="' + field + '" value="' + escapeReportText(opt) + '"' + (checked ? ' checked' : '') + '>' +
          '<span>' + escapeReportText(opt) + '</span></label>';
      }).join('') + '</div></div>';
  }

  function entrySelect(label, field, options, required, value){
    const opts = [''].concat(options).map(function(opt){
      const sel = String(opt) === String(value || '') ? ' selected' : '';
      return '<option value="' + escapeReportText(opt) + '"' + sel + '>' + escapeReportText(opt || 'Choose') + '</option>';
    }).join('');
    return '<label class="entry-field"><span>' + escapeReportText(label) + (required ? ' *' : '') +
      '</span><select data-entry-field="' + field + '" class="entry-select">' + opts + '</select></label>';
  }

  function entryInput(label, field, type, required, value, placeholder){
    const val = type === 'date' ? sheetDateToIso(value) : (value || '');
    return '<label class="entry-field"><span>' + escapeReportText(label) + (required ? ' *' : '') +
      '</span><input data-entry-field="' + field + '" type="' + (type || 'text') + '" class="entry-input" value="' +
      escapeReportText(val) + '" placeholder="' + escapeReportText(placeholder || '') + '"></label>';
  }

  function readEntryWizardFields(){
    const radiosDone = {};
    document.querySelectorAll('#entryWizardBody [data-entry-field]').forEach(function(el){
      const key = el.dataset.entryField;
      if(!key) return;
      if(el.type === 'radio'){
        if(radiosDone[key]) return;
        const picked = document.querySelector('#entryWizardBody input[type="radio"][data-entry-field="' + key + '"]:checked');
        entryFormState[key] = picked ? picked.value : '';
        radiosDone[key] = true;
      }else if(el.type === 'date'){
        entryFormState[key] = isoDateToSheet(el.value);
      }else{
        entryFormState[key] = el.value;
      }
    });
  }

  function bindEntryFieldEvents(stepId){
    const body = document.getElementById('entryWizardBody');
    if(!body) return;
    const rerenderSteps = ['intro', 'airway', 'trach_pick', 'movement', 'machine_pick'];
    body.querySelectorAll('select[data-entry-field], input[type="radio"][data-entry-field]').forEach(function(el){
      el.addEventListener('change', function(){
        readEntryWizardFields();
        if(rerenderSteps.indexOf(stepId) !== -1){
          clampStepIndex();
          renderEntryWizardStep();
        }else{
          body.querySelectorAll('.entry-choice-card').forEach(function(card){
            const input = card.querySelector('input[type="radio"]');
            if(input) card.classList.toggle('selected', input.checked);
          });
        }
      });
    });
  }

  function clampStepIndex(){
    const steps = getEntryWizardSteps(entryFormState);
    if(entryWizardStepIndex >= steps.length) entryWizardStepIndex = steps.length - 1;
  }

  function scrollWizardBodyToTop(){
    const body = document.getElementById('entryWizardBody');
    if(body) body.scrollTop = 0;
  }

  function renderEntryWizardSidebar(steps){
    const sidebar = document.getElementById('entryWizardSidebar');
    if(!sidebar) return;
    const head = sidebar.querySelector('.entry-wizard-sidebar-head');
    const headHtml = head ? head.outerHTML : '';
    sidebar.innerHTML = headHtml + steps.map(function(step, idx){
      const cls = idx < entryWizardStepIndex ? 'done' : (idx === entryWizardStepIndex ? 'active' : '');
      const num = idx < entryWizardStepIndex ? '✓' : String(idx + 1);
      return '<div class="entry-step-pill ' + cls + '"><span class="entry-step-num">' + num + '</span><strong>' + escapeReportText(step.section || step.title) + '</strong></div>';
    }).join('');
  }

  function renderEntryWizardProgress(steps){
    const pct = steps.length > 1 ? Math.round(((entryWizardStepIndex + 1) / steps.length) * 100) : 0;
    const bar = document.getElementById('entryWizardProgressBar');
    const label = document.getElementById('entryWizardProgress');
    const mobileSteps = document.getElementById('entryWizardMobileSteps');
    if(bar) bar.style.width = pct + '%';
    if(label){
      const step = steps[entryWizardStepIndex];
      label.textContent = 'Step ' + (entryWizardStepIndex + 1) + ' of ' + steps.length + ' — ' + (step.section || step.title);
    }
    if(mobileSteps){
      mobileSteps.innerHTML = steps.map(function(step, idx){
        const cls = idx < entryWizardStepIndex ? 'done' : (idx === entryWizardStepIndex ? 'active' : '');
        const num = idx < entryWizardStepIndex ? '✓' : String(idx + 1);
        const title = escapeReportText(step.section || step.title);
        return '<span class="entry-mobile-step ' + cls + '" title="' + title + '" aria-label="' + title + '">' + num + '</span>';
      }).join('');
      const active = mobileSteps.querySelector('.entry-mobile-step.active');
      if(active && typeof active.scrollIntoView === 'function'){
        active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function renderEntryWizardStep(){
    const s = entryFormState;
    const steps = getEntryWizardSteps(s);
    clampStepIndex();
    const step = steps[entryWizardStepIndex];
    const body = document.getElementById('entryWizardBody');
    const backBtn = document.getElementById('entryWizardBackBtn');
    const nextBtn = document.getElementById('entryWizardNextBtn');

    renderEntryWizardSidebar(steps);
    renderEntryWizardProgress(steps);
    if(backBtn) backBtn.style.visibility = entryWizardStepIndex === 0 ? 'hidden' : 'visible';
    if(nextBtn) nextBtn.textContent = step.id === 'review' ? 'Submit to Google Sheet' : 'Next';

    let html = '';

    if(step.id === 'intro'){
      html += entryStepPanel('PHDU Critical Items',
        entryInput('Date', 'date', 'date', true, s.date) +
        entryChoiceCards('Item Category', 'category', PHDU_FORM.categories, true, s.category, 'entry-choice-grid--categories'));
    }
    if(step.id === 'machine_pick'){
      html += entryStepPanel('Machine Items',
        entryChoiceCards('Select Machine:', 'machine', PHDU_FORM.machines, true, s.machine));
    }
    if(step.id === 'machine_status'){
      html += entryStepPanel('Machine Status',
        entryInput('Device Brand / Model', 'deviceBrand', 'text', false, s.deviceBrand) +
        entryChoiceCards('Biomed Number', 'biomedPreset', PHDU_FORM.biomedPresets, false, s.biomedPreset) +
        (s.biomedPreset !== 'No Biomed Number' ? entryInput('Enter Biomed Number', 'biomedNumber', 'text', false, s.biomedNumber) : '') +
        entryChoiceCards('Device Status', 'deviceStatus', PHDU_FORM.deviceStatus, false, s.deviceStatus) +
        entryInput('Last date of service', 'lastServiceDate', 'date', false, s.lastServiceDate) +
        entryChoiceCards('Device Status description', 'deviceStatusDesc', PHDU_FORM.deviceStatusDesc, false, s.deviceStatusDesc) +
        entryChoiceCards('Where is the device', 'deviceLocation', PHDU_FORM.deviceLocation, false, s.deviceLocation));
    }
    if(step.id === 'machine_where'){
      html += entryStepPanel('where',
        entryChoiceCards('where', 'tubeWhere', PHDU_FORM.tubeWhere, false, s.tubeWhere));
    }
    if(step.id === 'airway'){
      html += entryStepPanel('Airway Items',
        entryChoiceCards('Selected item Airway', 'airwayItem', PHDU_FORM.airwayItems, true, s.airwayItem));
    }
    if(step.id === 'trach_pick'){
      html += entryStepPanel('Select item of Tracheostomy',
        entryChoiceCards('Select item of Tracheostomy', 'trachItem', PHDU_FORM.trachItems, true, s.trachItem));
    }
    if(step.id === 'trach_accessory'){
      html += entryStepPanel('Accessory for Tracheostomy',
        entryChoiceCards('Accessory for Tracheostomy', 'trachAccessory', PHDU_FORM.trachAccessories, true, s.trachAccessory));
    }
    if(step.id === 'trach_where_acc'){
      html += entryStepPanel('where',
        entryChoiceCards('where', 'tubeWhere', PHDU_FORM.tubeWhere, false, s.tubeWhere));
    }
    if(step.id === 'trach_tube'){
      html += entryStepPanel('Type of the Tracheostomy',
        entryChoiceCards('Type of the Tracheostomy', 'trachTypeCategory', PHDU_FORM.trachTypeCategories, true, s.trachTypeCategory) +
        entryChoiceCards('What is the tracheostomy tube type?', 'tubeType', PHDU_FORM.tubeTypes, true, s.tubeType) +
        entryChoiceCards('What is the tracheostomy tube size', 'tubeSize', PHDU_FORM.tubeSizes, true, s.tubeSize));
    }
    if(step.id === 'trach_where'){
      html += entryStepPanel('where',
        entryChoiceCards('where', 'tubeWhere', PHDU_FORM.tubeWhere, false, s.tubeWhere));
    }
    if(step.id === 'ppe'){
      html += entryStepPanel('PPE Item',
        entryChoiceCards('Selected item PPE', 'ppeItem', PHDU_FORM.ppeItems, true, s.ppeItem));
    }
    if(step.id === 'hygienic'){
      html += entryStepPanel('Hygienic Items',
        entrySelect('Selected item Hygienic Items', 'hygienicItem', PHDU_FORM.hygienicItems, true, s.hygienicItem));
    }
    if(step.id === 'procedure'){
      html += entryStepPanel('Procedure Items',
        entrySelect('Selected item Procedure Items', 'procedureItem', PHDU_FORM.procedureItems, true, s.procedureItem));
    }
    if(step.id === 'patient_care'){
      html += entryStepPanel('Patient Care',
        entryChoiceCards('Selected item Patient Care', 'patientCareItem', PHDU_FORM.patientCareItems, true, s.patientCareItem));
    }
    if(step.id === 'movement'){
      html += entryStepPanel('Item Movement (Received or Consumed)',
        entrySection('', PHDU_FORM.movementHint) +
        entryChoiceCards('Was the item received or consumed?', 'action', PHDU_FORM.actions, true, s.action));
    }
    if(step.id === 'receiving'){
      html += entryStepPanel('Receiving Status',
        entryChoiceCards('How was the item added to the store stock?', 'stockMethod', PHDU_FORM.stockMethods, true, s.stockMethod) +
        entryInput('Indent Number', 'indentNumber', 'text', true, s.indentNumber));
    }
    if(step.id === 'consumed'){
      html += entryStepPanel('Consumed',
        entryChoiceCards('How was the item consumed?', 'consumeMethod', PHDU_FORM.consumeMethods, true, s.consumeMethod));
    }
    if(step.id === 'counting'){
      html += entryStepPanel('counting the stock',
        entryInput('Number of items consumed/ added to the stock?', 'quantity', 'number', true, s.quantity, 'Quantity') +
        entryInput('Expiry Date', 'expiryDate', 'date', true, s.expiryDate));
    }
    if(step.id === 'not_available'){
      html += entryStepPanel('Item not available',
        entryInput('Incident number', 'incidentNumber', 'text', false, s.incidentNumber) +
        entryInput('Barwa number', 'barwaNumber', 'text', false, s.barwaNumber));
    }
    if(step.id === 'review'){
      html += entryStepPanel('Review your answers',
        '<div class="entry-review-grid">' + getEntryReviewRows().map(function(row){
          return '<div class="entry-review-row"><span>' + escapeReportText(row.label) + '</span><strong>' + escapeReportText(row.value) + '</strong></div>';
        }).join('') + '</div>');
    }

    body.innerHTML = html;
    bindEntryFieldEvents(step.id);
    scrollWizardBodyToTop();
    if(typeof window.mountTrachBoxScanner === 'function'){
      window.mountTrachBoxScanner(step.id);
    }
  }

  function validateEntryWizardStep(){
    const step = getEntryWizardSteps(entryFormState)[entryWizardStepIndex];
    const s = entryFormState;
    function need(val, msg){ if(!val){ alert(msg); return false; } return true; }

    if(step.id === 'intro') return need(s.date, 'Please enter Date.') && need(s.category, 'Please select Item Category.');
    if(step.id === 'machine_pick') return need(s.machine, 'Please select a machine.');
    if(step.id === 'airway') return need(s.airwayItem, 'Please select Selected item Airway.');
    if(step.id === 'trach_pick') return need(s.trachItem, 'Please select item of Tracheostomy.');
    if(step.id === 'trach_accessory') return need(s.trachAccessory, 'Please select accessory.');
    if(step.id === 'trach_tube'){
      return need(s.trachTypeCategory, 'Select Type of the Tracheostomy.') &&
        need(s.tubeType, 'Select tube type (Cuffed/Uncuffed).') &&
        need(s.tubeSize, 'Select tube size.');
    }
    if(step.id === 'ppe') return need(s.ppeItem, 'Please select PPE item.');
    if(step.id === 'hygienic') return need(s.hygienicItem, 'Please select hygienic item.');
    if(step.id === 'procedure') return need(s.procedureItem, 'Please select procedure item.');
    if(step.id === 'patient_care') return need(s.patientCareItem, 'Please select patient care item.');
    if(step.id === 'movement') return need(s.action, 'Please select received / consumed / not available.');
    if(step.id === 'receiving') return need(s.stockMethod, 'Select how stock was added.') && need(s.indentNumber, 'Enter Indent Number.');
    if(step.id === 'consumed') return need(s.consumeMethod, 'Select how item was consumed.');
    if(step.id === 'counting') return need(s.quantity, 'Enter quantity.') && need(s.expiryDate, 'Enter Expiry Date.');
    if(step.id === 'not_available'){
      if(!s.incidentNumber && !s.barwaNumber){
        alert('Enter Incident number and/or Barwa number.');
        return false;
      }
    }
    return true;
  }

  function resolveBiomedValue(s){
    if(s.biomedPreset === 'No Biomed Number') return 'No Biomed Number';
    return s.biomedNumber || s.biomedPreset || '';
  }

  function resolveEntryItemLabel(s){
    if(s.category === 'Machine') return s.machine || '—';
    if(s.category === 'PPE') return s.ppeItem || '—';
    if(s.category === 'Hygienic Items') return s.hygienicItem || '—';
    if(s.category === 'Procedure Items') return s.procedureItem || '—';
    if(s.category === 'Patient Care') return s.patientCareItem || '—';
    if(s.category === 'Airway Items'){
      if(s.airwayItem === 'ET' || s.airwayItem === 'Swedish Nose') return s.airwayItem;
      if(s.trachItem === 'Accessory') return s.trachAccessory || '—';
      if(s.trachItem === 'Tracheostomy Tube'){
        return 'Tracheostomy Tube (' + s.trachTypeCategory + ' ' + s.tubeType + ' · ' + s.tubeSize + ')';
      }
    }
    return '—';
  }

  function getEntryReviewRows(){
    const s = entryFormState;
    const rows = [
      { label: 'Date', value: s.date },
      { label: 'Item Category', value: s.category },
      { label: 'Item', value: resolveEntryItemLabel(s) },
      { label: 'Action', value: s.action || '—' }
    ];
    if(s.trachItem === 'Tracheostomy Tube' && s.tubeWhere) rows.push({ label: 'where', value: s.tubeWhere });
    if(s.trachItem === 'Accessory' && s.tubeWhere) rows.push({ label: 'where', value: s.tubeWhere });
    if(s.category === 'Machine' && s.tubeWhere) rows.push({ label: 'where', value: s.tubeWhere });
    if(s.action === 'Received stock'){
      rows.push({ label: 'Stock method', value: s.stockMethod }, { label: 'Indent Number', value: s.indentNumber });
    }
    if(s.action === 'Consumed') rows.push({ label: 'Consumed method', value: s.consumeMethod });
    if(s.action === 'Received stock' || s.action === 'Consumed'){
      rows.push({ label: 'Quantity', value: s.quantity }, { label: 'Expiry Date', value: s.expiryDate });
    }
    if(s.action === 'Not available'){
      rows.push({ label: 'Incident number', value: s.incidentNumber || '—' }, { label: 'Barwa number', value: s.barwaNumber || '—' });
    }
    if(s.category === 'Machine'){
      rows.push(
        { label: 'Device Brand / Model', value: s.deviceBrand || '—' },
        { label: 'Biomed Number', value: resolveBiomedValue(s) || '—' },
        { label: 'Device Status', value: s.deviceStatus || '—' },
        { label: 'Where is the device', value: s.deviceLocation || '—' }
      );
    }
    return rows;
  }

  function buildSheetPayloadFromEntry(s){
    const now = new Date();
    const ts = formatDateForSheet(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    return {
      'Timestamp': ts,
      'Date': s.date,
      'Item Category ': s.category,
      'Selected item PPE': s.category === 'PPE' ? s.ppeItem : '',
      'Selected item Airway': s.category === 'Airway Items' ? s.airwayItem : '',
      'Select item of Tracheostomy': (s.category === 'Airway Items' && s.airwayItem === 'Tracheostomy') ? s.trachItem : '',
      'Type of the Tracheostomy   ': s.trachItem === 'Tracheostomy Tube' ? s.trachTypeCategory : '',
      '  What is the tracheostomy tube type?  ': s.trachItem === 'Tracheostomy Tube' ? s.tubeType : '',
      'What is the tracheostomy tube size ': s.trachItem === 'Tracheostomy Tube' ? s.tubeSize : '',
      'Accessory for Tracheostomy ': s.trachItem === 'Accessory' ? s.trachAccessory : '',
      'Selected item  Hygienic Items': s.category === 'Hygienic Items' ? s.hygienicItem : '',
      'Selected item  Procedure Items   ': s.category === 'Procedure Items' ? s.procedureItem : '',
      'Selected item  Patient Care   ': s.category === 'Patient Care' ? s.patientCareItem : '',
      'Was the item received or consumed?': s.action,
      'How was the item added to the store stock?': s.action === 'Received stock' ? s.stockMethod : '',
      'Indent Number ': s.action === 'Received stock' ? s.indentNumber : '',
      'How was the item consumed?': s.action === 'Consumed' ? s.consumeMethod : '',
      'Number of items consumed/ added to the stock?': s.quantity || '',
      'Expiry Date ': s.expiryDate || '',
      'Validity': '',
      'Incident number ': s.incidentNumber || '',
      'Barwa number': s.barwaNumber || '',
      'Select Machine:': s.category === 'Machine' ? s.machine : '',
      'Device Brand / Model  ': s.deviceBrand || '',
      '  Biomed Number  ': resolveBiomedValue(s),
      '  Device Status  ': s.deviceStatus || '',
      '  Device Status description ': s.deviceStatusDesc || '',
      'Where is the device': s.deviceLocation || '',
      'Last date of service': s.lastServiceDate || '',
      'where': s.tubeWhere || ''
    };
  }

  function queuePendingEntry(payload){
    const list = JSON.parse(localStorage.getItem(PENDING_ENTRIES_KEY) || '[]');
    list.push({ payload: payload, queuedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(list));
  }

  async function submitEntryToSheet(payload){
    const url = GOOGLE_SHEET_CONFIG.submitWebAppUrl;
    if(!url){
      queuePendingEntry(payload);
      return { ok: true, queued: true };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch(e) { result = { ok: response.ok }; }
    if(!result.ok) throw new Error(result.error || 'Could not submit to Google Sheet.');
    return result;
  }

  function setEntrySubmitStatus(type, message){
    const box = document.getElementById('entrySubmitStatus');
    if(!box) return;
    box.className = 'entry-submit-status' + (type ? ' show ' + type : '');
    box.textContent = message || '';
  }

  let savedScrollY = 0;

  function lockPageScroll(){
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add('entry-modal-open');
  }

  function unlockPageScroll(){
    document.body.classList.remove('entry-modal-open');
    window.scrollTo(0, savedScrollY);
  }

  window.openEntryWizard = function(){
    entryFormState = defaultEntryFormState();
    entryWizardStepIndex = 0;
    entryWizardSubmitting = false;
    setEntrySubmitStatus('', '');
    if(typeof window.clearTrachScan === 'function') window.clearTrachScan(true);
    lockPageScroll();
    document.getElementById('entryWizardOverlay').classList.add('show');
    renderEntryWizardStep();
  };

  window.closeEntryWizard = function(){
    document.getElementById('entryWizardOverlay').classList.remove('show');
    unlockPageScroll();
  };

  window.entryWizardBack = function(){
    if(entryWizardStepIndex <= 0) return;
    readEntryWizardFields();
    entryWizardStepIndex--;
    renderEntryWizardStep();
  };

  window.entryWizardNext = function(){
    if(entryWizardSubmitting) return;
    readEntryWizardFields();
    if(!validateEntryWizardStep()) return;
    const steps = getEntryWizardSteps(entryFormState);
    if(steps[entryWizardStepIndex].id === 'review'){
      submitEntryWizard();
      return;
    }
    if(entryWizardStepIndex < steps.length - 1){
      entryWizardStepIndex++;
      renderEntryWizardStep();
    }
  };

  window.PHDUEntryWizard = {
    getState: function(){
      return Object.assign({}, entryFormState);
    },
    setState: function(partial){
      Object.assign(entryFormState, partial || {});
    },
    rerender: function(){
      renderEntryWizardStep();
    },
    readFields: readEntryWizardFields,
    getCurrentStepId: function(){
      const steps = getEntryWizardSteps(entryFormState);
      const step = steps[entryWizardStepIndex];
      return step ? step.id : '';
    },
    isoDateToSheet: isoDateToSheet,
    sheetDateToIso: sheetDateToIso
  };

  async function submitEntryWizard(){
    if(entryWizardSubmitting) return;
    entryWizardSubmitting = true;
    readEntryWizardFields();
    const payload = buildSheetPayloadFromEntry(entryFormState);
    const nextBtn = document.getElementById('entryWizardNextBtn');
    if(nextBtn) nextBtn.disabled = true;
    setEntrySubmitStatus('loading', 'Sending to Google Sheet…');

    try{
      const result = await submitEntryToSheet(payload);
      setEntrySubmitStatus('ok', result.queued ? 'Saved locally until Web App URL is set.' : 'Submitted successfully to Google Sheet.');
      await loadReportFromGoogleSheet(true);
      dashboardFiltersReady = false;
      if(typeof invFiltersReady !== 'undefined') invFiltersReady = false;
      rerenderActivePage();
      setTimeout(closeEntryWizard, 1200);
    }catch(error){
      setEntrySubmitStatus('error', error.message);
    }finally{
      entryWizardSubmitting = false;
      if(nextBtn) nextBtn.disabled = false;
    }
  }
})();
