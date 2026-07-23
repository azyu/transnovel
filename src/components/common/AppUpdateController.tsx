import { useEffect } from 'react';
import { useUpdateStore } from '../../stores/updateStore';
import { AppUpdateDialog } from './AppUpdateDialog';

export const AppUpdateController: React.FC = () => {
  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  return <AppUpdateDialog />;
};
