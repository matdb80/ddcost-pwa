import { quoteInoxGrade } from "@/lib/quote-inox";
export default function QuoteInoxChoice({
  product,
  disabled,
  onChange,
}: {
  product: Record<string, any>;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  if (product.materiale_prodotto !== "inox") return null;
  const grade = quoteInoxGrade(product);
  return (
    <div
      role="group"
      aria-label="Tipo di inox"
      className="mt-2 flex flex-wrap gap-3 text-xs"
    >
      {["304", "316"].map(value => (
        <label key={value} className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            disabled={disabled}
            checked={grade === value}
            onChange={() => onChange(value)}
          />{" "}
          AISI {value}
        </label>
      ))}
      {!grade && (
        <span className="text-amber-800">Seleziona il tipo di inox.</span>
      )}
    </div>
  );
}
