export type RepositoryMutationResult<T = never> =
  | { status: 'completed'; value: T }
  | {
      status:
        | 'forbidden'
        | 'not_found'
        | 'conflict'
        | 'invalid_capabilities'
        | 'base_role_mismatch';
    };
