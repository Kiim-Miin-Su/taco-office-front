export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  size?: ButtonSize;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default ButtonProps;
