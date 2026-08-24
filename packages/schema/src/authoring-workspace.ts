import { Type, type Static } from '@sinclair/typebox';

export const AUTHORING_WORKSPACE_VIEWS = ['canvas', 'flowMap', 'reviewRecovery'] as const;
export const AuthoringWorkspaceView = Type.Union(
  AUTHORING_WORKSPACE_VIEWS.map((view) => Type.Literal(view)),
  { $id: 'AuthoringWorkspaceView' },
);
export type AuthoringWorkspaceView = Static<typeof AuthoringWorkspaceView>;

const AUTHORING_DOCUMENT_IDENTIFIER_OPTIONS = { minLength: 1, maxLength: 256 } as const;

export const ExistingAuthoringDocumentIntent = Type.Object(
  {
    kind: Type.Literal('existing'),
    documentId: Type.String(AUTHORING_DOCUMENT_IDENTIFIER_OPTIONS),
    workspace: Type.Optional(
      Type.Union(AUTHORING_WORKSPACE_VIEWS.map((view) => Type.Literal(view))),
    ),
    focusBlockId: Type.Optional(Type.String(AUTHORING_DOCUMENT_IDENTIFIER_OPTIONS)),
  },
  { $id: 'ExistingAuthoringDocumentIntent', additionalProperties: false },
);
export type ExistingAuthoringDocumentIntent = Static<typeof ExistingAuthoringDocumentIntent>;

export const AUTHORING_DRAFT_DOCUMENT_TYPES = [
  'tour',
  'announcement',
  'hotspot',
  'survey',
  'checklist',
] as const;

export const NewAuthoringDocumentIntent = Type.Object(
  {
    kind: Type.Literal('new-draft'),
    documentType: Type.Union(
      AUTHORING_DRAFT_DOCUMENT_TYPES.map((documentType) => Type.Literal(documentType)),
    ),
  },
  { $id: 'NewAuthoringDocumentIntent', additionalProperties: false },
);
export type NewAuthoringDocumentIntent = Static<typeof NewAuthoringDocumentIntent>;

export const AuthoringDocumentIntent = Type.Union(
  [ExistingAuthoringDocumentIntent, NewAuthoringDocumentIntent],
  { $id: 'AuthoringDocumentIntent' },
);
export type AuthoringDocumentIntent = Static<typeof AuthoringDocumentIntent>;
