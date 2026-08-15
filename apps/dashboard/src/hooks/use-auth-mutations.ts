'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspace,
  requestPasswordRecovery,
  resendEmailVerification,
  selectWorkspace,
  setPassword,
  signIn,
  signOut,
  signUp,
  verifyEmail,
} from '../lib/client-auth-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useAuthMutations() {
  const queryClient = useQueryClient();
  const clearWorkspaceCache = (): void => {
    queryClient.removeQueries({ queryKey: dashboardQueryKeys.all });
  };
  return {
    signIn: useMutation({ mutationFn: signIn, onSuccess: clearWorkspaceCache }),
    signUp: useMutation({ mutationFn: signUp, onSuccess: clearWorkspaceCache }),
    verifyEmail: useMutation({
      mutationFn: (input: { challengeId: string; token: string; password: string }) =>
        verifyEmail(input.challengeId, input.token, input.password),
      onSuccess: clearWorkspaceCache,
    }),
    requestPasswordRecovery: useMutation({ mutationFn: requestPasswordRecovery }),
    resendEmailVerification: useMutation({ mutationFn: resendEmailVerification }),
    setPassword: useMutation({
      mutationFn: (input: { challengeId: string; token: string; password: string }) =>
        setPassword(input.challengeId, input.token, input.password),
      onSuccess: clearWorkspaceCache,
    }),
    signOut: useMutation({ mutationFn: signOut, onSuccess: clearWorkspaceCache }),
    createWorkspace: useMutation({ mutationFn: createWorkspace, onSuccess: clearWorkspaceCache }),
    selectWorkspace: useMutation({ mutationFn: selectWorkspace, onSuccess: clearWorkspaceCache }),
  };
}
