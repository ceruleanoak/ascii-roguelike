// Schema-driven form. Renders the core sections + mechanic blocks into a
// container, binds inputs to the live def object, and calls onChange() after
// any edit so the sandbox + codegen can refresh.
import { SECTIONS, MECHANICS, GRID_CELL } from './schema.js';
import { getPath, setPath, deletePath, seedBlock, clearBlock, isBlockOn, defaultFor, fieldApplies, newListItem } from './util.js';

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
      if (!fieldApplies(field, this.def)) continue;
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
        if (!fieldApplies(field, this.def)) continue;
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

  // A list of uniform rows — a potion table, a pulse rhythm, a drop table.
  // Each row's columns are ordinary fields addressed by an indexed path, so
  // every input type already in renderField works inside one for free.
  renderList(field) {
    const wrap = document.createElement('div');
    wrap.className = 'field field-list';

    const head = document.createElement('div');
    head.className = 'list-head';
    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.help) label.title = field.help;
    head.appendChild(label);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'list-add';
    add.textContent = '+';
    add.title = 'Add a row';
    add.addEventListener('click', () => {
      const list = getPath(this.def, field.key);
      // An absent list is the same instruction as an empty one, so the first
      // add is also what materializes the key.
      if (Array.isArray(list)) list.push(newListItem(field));
      else setPath(this.def, field.key, [newListItem(field)]);
      this.afterStructuralEdit(field);
    });
    head.appendChild(add);
    wrap.appendChild(head);

    const items = getPath(this.def, field.key);
    if (!Array.isArray(items) || items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = field.emptyLabel ?? '(none)';
      wrap.appendChild(empty);
      return wrap;
    }

    items.forEach((_, i) => wrap.appendChild(this.renderListRow(field, i, items.length)));
    return wrap;
  }

  renderListRow(field, i, count) {
    const row = document.createElement('div');
    row.className = 'list-row';

    const bar = document.createElement('div');
    bar.className = 'list-row-bar';
    const n = document.createElement('span');
    n.className = 'list-row-n';
    n.textContent = String(i + 1);
    bar.appendChild(n);

    // Order is meaningful in every list this serves — pulse 0 is the activation
    // hit, and a strike's bands are read nearest-first — so reordering is a
    // first-class edit, not a nicety.
    const move = (to) => {
      const list = getPath(this.def, field.key);
      list.splice(to, 0, list.splice(i, 1)[0]);
      this.afterStructuralEdit(field);
    };
    bar.appendChild(this.rowButton('↑', 'Move up', i === 0, () => move(i - 1)));
    bar.appendChild(this.rowButton('↓', 'Move down', i === count - 1, () => move(i + 1)));
    bar.appendChild(this.rowButton('✕', 'Remove', false, () => {
      deletePath(this.def, `${field.key}[${i}]`);
      this.afterStructuralEdit(field);
    }));
    row.appendChild(bar);

    const body = document.createElement('div');
    body.className = 'list-row-body';
    for (const col of field.itemFields) {
      // The column is rendered against its absolute path, which is what makes
      // the ordinary binding work: the input writes straight into the row.
      // A list whose authoring notes read its contents (the pulse rhythm
      // summary) declares `rerender` once, and every column inherits it.
      body.appendChild(this.renderField({
        ...col,
        key: `${field.key}[${i}].${col.key}`,
        rerender: col.rerender ?? field.rerender,
      }));
    }
    row.appendChild(body);
    return row;
  }

  rowButton(glyph, title, disabled, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'list-btn';
    b.textContent = glyph;
    b.title = title;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  // Adding, removing, or reordering shifts every row's index, so the rendered
  // paths are stale the moment it happens — always re-render.
  afterStructuralEdit(field) {
    field.reconcile?.(this.def);
    this.emit();
    this.render();
  }

  renderField(field) {
    if (field.type === 'list') return this.renderList(field);

    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.help) label.title = field.help;
    row.appendChild(label);

    const value = getPath(this.def, field.key);
    // A field may derive its options from the rest of the def (the animation
    // list narrows to what the chosen shape supports). Such a field pairs the
    // function with `rerender` so the list is rebuilt when its input changes.
    const options = typeof field.options === 'function' ? field.options(this.def) : field.options;
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
        for (const opt of options) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt === '' ? '(none)' : opt;
          // Compared as text because a `numeric` select's options are numbers
          // while the element only ever hands back strings.
          if (String(opt) === String(value ?? '')) o.selected = true;
          input.appendChild(o);
        }
        input.addEventListener('change', () => {
          // `numeric` selects store the number, not its text, so the value that
          // reaches the enemy data is the same type the library validates.
          // Blank stays blank — it means "unset", which is not the number zero.
          const raw = input.value;
          setPath(this.def, field.key, field.numeric && raw !== '' ? Number(raw) : raw);
          this.afterEdit(field);
        });
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
        for (const opt of options) {
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
        // An unset key is not a zero — the game falls back to a real number, so
        // the box stays empty and shows that number as its placeholder rather
        // than reading "0 px" for a keeper that actually holds at 1.5 cells.
        const fallback = defaultFor(field, this.def);
        input.value = value ?? '';
        input.placeholder = String(fallback);
        if (field.step) input.step = field.step;
        const hint = document.createElement('span');
        hint.className = 'px-hint';
        const setHint = () => {
          const px = input.value === '' ? fallback : Number(input.value);
          hint.textContent = `${(px / GRID_CELL).toFixed(2)} cells${input.value === '' ? ' (default)' : ''}`;
        };
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
          // An empty box always means "unset", and shows what the game falls
          // back to as its placeholder. A field declared with a null default is
          // one the game has no fallback for at all, so there is nothing to show.
          const optional = field.default === null;
          const fallback = defaultFor(field, this.def);
          input.value = value ?? '';
          if (!optional) input.placeholder = String(fallback);
          input.addEventListener('input', () => {
            const raw = input.value;
            // Clearing the box unsets the key rather than writing a zero the
            // codegen would then emit as a deliberate value.
            setPath(this.def, field.key, raw === '' ? null : Number(raw));
            this.afterEditLight(field);
          });
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
    // A field can invalidate another — switching a telegraph's Area strands an
    // animation that Area cannot express. The reconciler runs before the emit
    // so the sandbox is never handed the inconsistent pair, even briefly.
    const reconciled = field.reconcile ? field.reconcile(this.def) : false;
    this.emit();
    if (field.rerender || reconciled) { this.render(); return; }
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
