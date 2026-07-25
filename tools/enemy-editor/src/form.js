// Schema-driven form. Renders the core sections + mechanic blocks into a
// container, binds inputs to the live def object, and calls onChange() after
// any edit so the sandbox + codegen can refresh.
import { SECTIONS, MECHANICS } from './schema.js';
import { getPath, setPath, seedBlock, clearBlock, isBlockOn } from './util.js';

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
      this.container.appendChild(this.renderSection(section));
    }
    const mechHeader = document.createElement('div');
    mechHeader.className = 'mech-header';
    mechHeader.textContent = 'MECHANICS';
    this.container.appendChild(mechHeader);
    for (const mech of MECHANICS) {
      this.container.appendChild(this.renderMechanic(mech));
    }
  }

  // A section is always-on unless it declares a gate, in which case its heading
  // carries the presence toggle (Telegraph) — absent means the enemy keeps the
  // legacy behavior, so the block has to be removable, not just zeroed.
  renderSection(section) {
    const wrap = document.createElement('section');
    wrap.className = 'section';
    const on = !section.gate || isBlockOn(this.def, section);

    if (section.gate) {
      wrap.appendChild(this.renderGateHead(section, on, 'section-toggle'));
    } else {
      const h = document.createElement('h3');
      h.textContent = section.title;
      wrap.appendChild(h);
    }

    if (!on) return wrap;
    for (const field of section.fields) {
      if (field.showIf && !field.showIf(this.def)) continue;
      wrap.appendChild(this.renderField(field));
    }
    this.appendNotes(wrap, section);
    return wrap;
  }

  renderMechanic(mech) {
    const wrap = document.createElement('section');
    wrap.className = 'section mech';
    const on = isBlockOn(this.def, mech);
    wrap.appendChild(this.renderGateHead(mech, on, 'mech-toggle'));

    if (on) {
      const body = document.createElement('div');
      body.className = 'mech-body';
      for (const field of mech.fields) {
        if (field.showIf && !field.showIf(this.def)) continue;
        body.appendChild(this.renderField(field));
      }
      this.appendNotes(body, mech);
      wrap.appendChild(body);
    }
    return wrap;
  }

  // Presence toggle for a gated block (mechanic or section).
  renderGateHead(block, on, className) {
    const head = document.createElement('label');
    head.className = className;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = on;
    cb.addEventListener('change', () => {
      if (cb.checked) seedBlock(this.def, block);
      else clearBlock(this.def, block);
      this.emit();
      this.render();
    });
    head.appendChild(cb);
    const title = document.createElement('span');
    title.textContent = block.title;
    head.appendChild(title);
    return head;
  }

  // Live authoring feedback from the block's note(def): warnings for conflicts
  // the game would only report to the console at swing time, and info lines that
  // spell out what the current data compiles to.
  appendNotes(parent, block) {
    if (!block.note) return;
    for (const note of block.note(this.def)) {
      const div = document.createElement('div');
      div.className = `note ${note.level}`;
      div.textContent = note.text;
      parent.appendChild(div);
    }
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
        // Unset reads as blank rather than "null": for an optional shape or
        // pulse list, empty is the meaningful state and should look empty.
        input.value = value == null ? '' : JSON.stringify(value);
        if (field.placeholder) input.placeholder = field.placeholder;
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

  // Heavy edit (structural / showIf- or note-affecting): re-render whole form.
  afterEdit(field) {
    this.emit();
    if (field.rerender) { this.render(); return; }
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
