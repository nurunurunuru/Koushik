"use client";

import { cn } from "@/src/lib/utils";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = "md",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
  };

  return (
    <div
      ref={overlayRef}
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        p-4 sm:p-6
        bg-black/50
        backdrop-blur-sm
      "
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          `
          w-full
          ${sizes[size]}
          max-h-[90vh]
          flex flex-col
          overflow-hidden
          rounded-2xl
          border border-gray-200
          bg-white
          shadow-2xl
          `,
          "animate-in fade-in zoom-in duration-200",
          className
        )}
      >
        {/* HEADER */}
        {title && (
          <div
            className="
              flex
              flex-shrink-0
              items-center
              justify-between
              border-b
              border-gray-100
              bg-white
              px-5
              py-4
            "
          >
            <h2 className="text-lg font-semibold text-gray-900">
              {title}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="
                rounded-lg
                p-2
                text-gray-400
                transition
                hover:bg-gray-100
                hover:text-gray-700
              "
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* SCROLLABLE CONTENT */}
        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            overscroll-contain
          "
        >
          {children}
        </div>
      </div>
    </div>
  );
}