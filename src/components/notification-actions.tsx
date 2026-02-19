'use client';

import { useTransition } from 'react';

interface NotificationActionsProps {
  notificationId: string;
  isRead: boolean;
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onDismiss: (notificationId: string) => Promise<void>;
}

export default function NotificationActions({
  notificationId,
  isRead,
  onMarkAsRead,
  onDismiss,
}: NotificationActionsProps) {
  const [isReadPending, startReadTransition] = useTransition();
  const [isDismissPending, startDismissTransition] = useTransition();

  return (
    <div className="flex gap-2">
      {!isRead && (
        <button
          onClick={() =>
            startReadTransition(async () => {
              await onMarkAsRead(notificationId);
            })
          }
          disabled={isReadPending}
          className="btn btn-sm btn-primary btn-outline"
        >
          {isReadPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Mark as Read
            </>
          )}
        </button>
      )}
      <button
        onClick={() =>
          startDismissTransition(async () => {
            await onDismiss(notificationId);
          })
        }
        disabled={isDismissPending}
        className="btn btn-sm btn-ghost text-base-content/50 hover:text-error"
      >
        {isDismissPending ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Dismiss
          </>
        )}
      </button>
    </div>
  );
}
