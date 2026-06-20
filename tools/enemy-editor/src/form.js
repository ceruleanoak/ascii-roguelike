// Schema-driven form. Renders the core sections + mechanic blocks into a
// container, binds inputs to the live def object, and calls onChange() after
// any edit so the sandbox + codegen can refresh.
import { SECTIONS, MECHANICS } from './schema.js';
import { getPath, setPath, seedMechanic, clearMechanic, isMechanicOn } from './util.js';

export class EnemyForm {
  constructor(container, def, onChange) {
    this.container = container;
    this.def = def;
    this.onChange = onChange;
    this.render();
  }

  setDef(def) {
    this.def = def;
    this.render();
  }

  emit() {
    this.onChange?.(this.def);
  }

  render() {
    this.container.innerHTML = '';
    for (const section of SECTIONS) {
      if (section.showIf && !section.showIf(this.def)) continue;
      this.container.appendChild(this.renderSection(section, false));
    }
    const mechHeader = document.createElement('div');
    mechHeader.className = 'mech-header';
    mechHeader.textContent = 'MECHANICS';
    this.container.appendChild(mechHeader);
    for (const mech of MECHANICS) {
      this.container.appendChild(this.renderMechanic(mech));
    }
  }

  renderSection(section, collapsible) {
    const wrap = document.createElement('section');
    wrap.className = 'section';
    const h = document.createElement('h3');
    h.textContent = section.title;
    wrap.appendChild(h);
    for (const field of section.fields) {
      if (field.showIf && !field.showIf(this.def)) continue;
      wrap.appendChild(this.renderField(field));
    }
    return wrap;
  }

  renderMechanic(mech) {
    const wrap = document.createElement('section');
    wrap.className = 'section mech';
    const on = isMechanicOn(this.def, mech);

    const head = document.createElement('label');
    head.className = 'mech-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = on;
    cb.addEventListener('change', () => {
      if (cb.checked) seedMechanic(this.def, mech);
      else clearMechanic(this.def, mech);
      this.emit();
      this.render();
    });
    head.appendChild(cb);
    const title = document.createElement('span');
    title.textContent = mech.title;
    head.appendChild(title);
    wrap.appendChild(head);

    if (on) {
      const body = document.createElement('div');
      body.className = 'mech-body';
      for (const field of mech.fields) {
        if (field.showIf && !field.showIf(this.def)) continue;
        body.appendChild(this.renderField(field));
      }
      wrap.appendChild(body);
    }
    return wrap;
  }

  renderField(field) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.help) label.title = field.help;
    row.appendChild(label);

    const value = getPath(this.def, field.key);
    let input;

    switch (field.type) {
      case 'bool': {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!value;
        input.addEventListener('change', () => { setPath(this.def, field.key, input.checked); this.afterEdit(field); });
        break;
      }
      case 'select': {
        input = document.createElement('select');
        for (const opt of field.options) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt === '' ? '(none)' : opt;
          if (opt === value) o.selected = true;
          input.appendChild(o);
        }
        input.addEventListener('change', () => { setPath(this.def, field.key, input.value); this.afterEdit(field); });
        break;
      }
      case 'color': {
        const grp = document.createElement('div');
        grp.className = 'color-grp';
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = normalizeHex(value);
        const text = document.createElement('input');
        text.type = 'text';
        text.className = 'color-text';
        text.value = value ?? '';
        const sync = (v) => { setPath(this.def, field.key, v); this.afterEdit(field); };
        picker.addEventListener('input', () => { text.value = picker.value; sync(picker.value); });
        text.addEventListener('change', () => { picker.value = normalizeHex(text.value); sync(text.value); });
        grp.appendChild(picker); grp.appendChild(text);
        input = grp;
        break;
      }
      case 'tags': {
        input = document.createElement('input');
        input.type = 'text';
        input.value = Array.isArray(value) ? value.join(', ') : '';
        input.placeholder = 'comma, separated';
        input.addEventListener('change', () => {
          const arr = input.value.split(',').map(s => s.trim()).filter(Boolean);
          setPath(this.def, field.key, arr); this.afterEdit(field);
        });
        break;
      }
      case 'tagset': {
        const grp = document.createElement('div');
        grp.className = 'tagset';
        const sel = new Set(Array.isArray(value) ? value : []);
        for (const opt of field.options) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'chip' + (sel.has(opt) ? ' on' : '');
          chip.textContent = opt;
          chip.addEventListener('click', () => {
            if (sel.has(opt)) sel.delete(opt); else sel.add(opt);
            chip.classList.toggle('on');
            setPath(this.def, field.key, [...sel]); this.afterEdit(field);
          });
          grp.appendChild(chip);
        }
        input = grp;
        break;
      }
      case 'json': {
        input = document.createElement('textarea');
        input.className = 'json';
        input.rows = 2;
        input.value = JSON.stringify(value ?? (Array.isArray(field.default) ? [] : {}));
        input.addEventListener('change', () => {
          try {
            setPath(this.def, field.key, JSON.parse(input.value || 'null'));
            input.classList.remove('bad');
          } catch { input.classList.add('bad'); return; }
          this.afterEdit(field);
        });
        break;
      }
      case 'px': {
        const grp = document.createElement('div');
        grp.className = 'px-grp';
        input = document.createElement('input');
        input.type = 'number';
        input.value = value ?? 0;
        if (field.step) input.step = field.step;
        const hint = document.createElement('span');
        hint.className = 'px-hint';
        const setHint = () => { hint.textContent = `${(Number(input.value) / 16).toFixed(2)} cells`; };
        setHint();
        input.addEventListener('input', () => {
          setPath(this.def, field.key, Number(input.value)); setHint(); this.afterEditLight(field);
        });
        input.addEventListener('change', () => this.afterEdit(field));
        grp.appendChild(input); grp.appendChild(hint);
        input = grp;
        break;
      }
      case 'char':
      case 'text':
      default: {
        if (field.type === 'number') {
          input = document.createElement('input');
          input.type = 'number';
          if (field.min !== undefined) input.min = field.min;
          if (field.max !== undefined) input.max = field.max;
          input.step = field.step ?? 1;
          input.value = value ?? 0;
          input.addEventListener('input', () => { setPath(this.def, field.key, Number(input.value)); this.afterEditLight(field); });
          input.addEventListener('change', () => this.afterEdit(field));
        } else {
          input = document.createElement('input');
          input.type = 'text';
          if (field.type === 'char') input.maxLength = 2;
          input.value = value ?? '';
          input.addEventListener('change', () => { setPath(this.def, field.key, input.value); this.afterEdit(field); });
        }
        break;
      }
    }

    row.appendChild(input);
    return row;
  }

  // Heavy edit (structural / showIf-affecting): re-render whole form.
  afterEdit(field) {
    this.emit();
    if (field.rerenders !== false && this.fieldAffectsVisibility(field)) this.render();
  }

  // Light edit (live number drag): update sandbox without re-rendering inputs.
  afterEditLight() {
    this.emit();
  }

  fieldAffectsVisibility(field) {
    // movementStyle / attackType toggle conditional sections & fields.
    return field.key === 'movementStyle' || field.key === 'attackType';
  }
}

function normalizeHex(v) {
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return '#888888';
}
