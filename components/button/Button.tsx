"use client";

export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  size?: ButtonSize;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

const sizeMap: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({ size = "md", label, onClick, disabled = false }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-md
        bg-blue-600
        font-medium
        text-white
        hover:bg-blue-700
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${sizeMap[size]}
      `}
    >
      {label}
    </button>
  );
}
