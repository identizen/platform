import { useMutation } from '@tanstack/react-query';
import { deleteIdentity, type DeleteReason } from '../api/delete-identity';

export function useDeleteIdentity(onDeleted: () => void) {
  return useMutation({
    mutationFn: (reason: DeleteReason) => deleteIdentity(reason),
    onSuccess: onDeleted,
  });
}
