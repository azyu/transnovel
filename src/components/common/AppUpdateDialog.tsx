import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUpdateStore } from '../../stores/updateStore';
import { Button } from './Button';
import { Modal } from './Modal';
import { useSettingsMessages } from '../settings/useSettingsMessages';

export const AppUpdateDialog: React.FC = () => {
  const status = useUpdateStore((state) => state.status);
  const update = useUpdateStore((state) => state.update);
  const error = useUpdateStore((state) => state.error);
  const downloadedBytes = useUpdateStore((state) => state.downloadedBytes);
  const totalBytes = useUpdateStore((state) => state.totalBytes);
  const isOpen = useUpdateStore((state) => state.isDialogOpen);
  const installUpdate = useUpdateStore((state) => state.installUpdate);
  const dismissDialog = useUpdateStore((state) => state.dismissDialog);
  const isTranslating = useTranslationStore((state) => state.isTranslating);
  const batchStatus = useSeriesStore((state) => state.batchProgress?.status);
  const settingsMessages = useSettingsMessages();

  if (!update) {
    return null;
  }

  const isUpdating = status === 'downloading' || status === 'installing';
  const hasActiveWork =
    isTranslating
    || batchStatus === 'pending'
    || batchStatus === 'translating'
    || batchStatus === 'paused';
  const progress = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={dismissDialog}
      title={settingsMessages.updater.title(update.version)}
      footer={(
        <>
          <Button variant="secondary" onClick={dismissDialog} disabled={isUpdating}>
            {settingsMessages.updater.later}
          </Button>
          <Button
            variant="primary"
            onClick={() => void installUpdate()}
            isLoading={isUpdating}
            disabled={hasActiveWork}
          >
            {settingsMessages.updater.installAndRestart}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p>{settingsMessages.updater.description(update.currentVersion, update.version)}</p>

        {update.body ? (
          <div>
            <h4 className="mb-2 font-medium">{settingsMessages.updater.releaseNotes}</h4>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/10 p-3 text-sm">
              {update.body}
            </div>
          </div>
        ) : null}

        {hasActiveWork ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500">
            {settingsMessages.updater.activeWorkBlocked}
          </p>
        ) : (
          <p className="text-sm">{settingsMessages.updater.restartWarning}</p>
        )}

        {status === 'downloading' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{settingsMessages.updater.downloading}</span>
              {progress !== null ? <span>{progress}%</span> : null}
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-500/20"
              role="progressbar"
              aria-label={settingsMessages.updater.downloading}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? undefined}
            >
              <div
                className={`h-full bg-blue-500 transition-all ${progress === null ? 'w-1/3 animate-pulse' : ''}`}
                style={progress === null ? undefined : { width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {status === 'installing' ? (
          <p className="text-sm">{settingsMessages.updater.installing}</p>
        ) : null}

        {status === 'error' && error ? (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
            {settingsMessages.updater.installFailed(error)}
          </p>
        ) : null}
      </div>
    </Modal>
  );
};
