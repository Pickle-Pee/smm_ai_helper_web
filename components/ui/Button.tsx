import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ai" | "danger" | "onDark";
export type ButtonSize = "sm" | "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

function buttonClass({ variant = "secondary", size = "md", block }: StyleProps, extra?: string) {
  return cx(styles.button, styles[variant], size !== "md" && styles[size], block && styles.block, extra);
}

const iconSize = (size: ButtonSize = "md") => (size === "sm" ? 15 : size === "lg" ? 18 : 16);

function Content({ icon: Icon, iconRight: IconRight, size, children }: StyleProps & { children?: ReactNode }) {
  return (
    <>
      {Icon && <Icon size={iconSize(size)} strokeWidth={2} aria-hidden />}
      {children}
      {IconRight && <IconRight size={iconSize(size)} strokeWidth={2} aria-hidden />}
    </>
  );
}

export type ButtonProps = StyleProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, icon, iconRight, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass({ variant, size, block }, className)} {...rest}>
      <Content icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Content>
    </button>
  );
});

export type ButtonLinkProps = StyleProps & ComponentProps<typeof Link>;

export function ButtonLink({ variant, size, block, icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      <Content icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Content>
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** Accessible name; also rendered as a hover/focus tooltip. */
  label: string;
  variant?: Extract<ButtonVariant, "ghost" | "secondary" | "onDark">;
  size?: ButtonSize;
  tooltip?: boolean;
  tooltipAlign?: "center" | "end";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = "ghost", size = "md", tooltip = true, tooltipAlign = "center", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={buttonClass({ variant, size }, cx(styles.icon, className))}
      {...rest}
    >
      <Icon size={size === "sm" ? 16 : 18} strokeWidth={1.9} aria-hidden />
      {tooltip && (
        <span className={cx(styles.tooltip, tooltipAlign === "end" && styles.tooltipLeft)} aria-hidden>
          {label}
        </span>
      )}
    </button>
  );
});
