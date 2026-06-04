export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  size?: ButtonSize;
  name: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default ButtonProps;
