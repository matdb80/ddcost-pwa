import { useEffect, useId, useState } from "react";
type Option = { value: string; label: string };
/** Editable combobox. Unknown text stays unselected and is validated at save. */
export default function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  className,
  placeholder,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const uid = useId(),
    listId = uid + "-options";
  const display = options.find(o => o.value === value)?.label ?? value;
  const [query, setQuery] = useState(display),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  useEffect(() => {
    setQuery(display);
  }, [display]);
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it");
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const filtered =
    query === display && options.some(o => o.value === value)
      ? options
      : options.filter(o =>
          terms.every(t => norm(o.label + " " + o.value).includes(t))
        );
  const choose = (o: Option) => {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
    setActive(0);
  };
  return (
    <div className="relative min-w-0">
      <input
        id={id ?? uid}
        role="combobox"
        aria-label={label}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && filtered[active] ? listId + "-" + active : undefined
        }
        className={
          className ??
          "h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
        }
        disabled={disabled}
        value={query}
        placeholder={placeholder ?? "Digita per cercare…"}
        onFocus={e => {
          setOpen(true);
          e.target.select();
        }}
        onBlur={() => setOpen(false)}
        onChange={e => {
          const text = e.target.value;
          setQuery(text);
          setOpen(true);
          setActive(0);
          onChange(
            options.find(
              o => norm(o.label) === norm(text) || norm(o.value) === norm(text)
            )?.value ?? text
          );
        }}
        onKeyDown={e => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive(i =>
              Math.max(
                0,
                Math.min(
                  filtered.length - 1,
                  i + (e.key === "ArrowDown" ? 1 : -1)
                )
              )
            );
          }
          if (e.key === "Enter" && open && filtered[active]) {
            e.preventDefault();
            choose(filtered[active]);
          }
        }}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label + " — suggerimenti"}
          className="absolute z-50 mt-1 max-h-60 w-full min-w-48 overflow-auto rounded-lg border bg-white py-1 text-sm text-slate-900 shadow-lg"
        >
          {filtered.map((o, i) => (
            <li
              id={listId + "-" + i}
              role="option"
              aria-selected={i === active}
              key={o.value}
              className={
                "cursor-pointer px-3 py-2 " +
                (i === active ? "bg-sky-100" : "hover:bg-slate-100")
              }
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
          {!filtered.length && (
            <li className="px-3 py-2 text-slate-500">Nessuna corrispondenza</li>
          )}
        </ul>
      )}
    </div>
  );
}
