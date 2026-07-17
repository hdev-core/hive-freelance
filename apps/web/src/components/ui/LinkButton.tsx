import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants";

export type LinkButtonProps = LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => {
    return (
      <Link ref={ref} className={buttonVariants(variant, size, className)} {...props} />
    );
  },
);

LinkButton.displayName = "LinkButton";
