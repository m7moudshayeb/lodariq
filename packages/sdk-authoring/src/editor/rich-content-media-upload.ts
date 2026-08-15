import type { AuthoringMediaAssetResource } from '@lodariq/schema';
import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical';
import { useState } from 'react';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import { createBlockId } from './ids';
import {
  clampUploadProgress,
  createLocalMediaPreview,
  createMediaPresentation,
  insertNodeAtSelection,
  mediaUploadErrorMessage,
  removeMediaNode,
  revokeLocalMediaPreview,
  setMediaUploadProgress,
} from './rich-content-commands';
import { $createRichMediaNode, $isRichMediaNode } from './rich-content-nodes';

export interface RichContentMediaUploadResult {
  asset: AuthoringMediaAssetResource;
  previewUrl: string | null;
}

export function useRichContentMediaUpload(
  editor: LexicalEditor,
  onUploadMedia?: (
    kind: 'image' | 'video' | 'captions',
    file: File,
    options: AuthoringMediaUploadOptions,
  ) => Promise<RichContentMediaUploadResult | null>,
): {
  captionTargetVideo: NodeKey | null;
  mediaUploadError: string | null;
  saveMediaToLibrary: boolean;
  setSaveMediaToLibrary: (value: boolean) => void;
  uploadCaptions: (file: File) => Promise<void>;
  uploadMediaIntoCanvas: (kind: 'image' | 'video', file: File, afterKey?: NodeKey | null) => Promise<void>;
  uploading: boolean;
} {
  const [saveMediaToLibrary, setSaveMediaToLibrary] = useState(false);
  const [captionTargetVideo, setCaptionTargetVideo] = useState<NodeKey | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);

  const uploadAsset = async (
    kind: 'image' | 'video' | 'captions',
    file: File,
    nodeKey: NodeKey,
  ): Promise<RichContentMediaUploadResult | null> => {
    if (!onUploadMedia) return null;
    setUploading(true);
    setMediaUploadError(null);
    setMediaUploadProgress(editor, nodeKey, 0);
    try {
      const result = await onUploadMedia(kind, file, {
        savedToLibrary: saveMediaToLibrary,
        onProgress: (progress) => {
          setMediaUploadProgress(editor, nodeKey, clampUploadProgress(progress));
        },
      });
      if (!result) {
        setMediaUploadProgress(editor, nodeKey, undefined);
        return null;
      }
      setMediaUploadProgress(editor, nodeKey, 100);
      return result;
    } catch (error) {
      setMediaUploadProgress(editor, nodeKey, undefined);
      setMediaUploadError(mediaUploadErrorMessage(error));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadMediaIntoCanvas = async (
    kind: 'image' | 'video',
    file: File,
    afterKey?: NodeKey | null,
  ): Promise<void> => {
    const localPreviewUrl = createLocalMediaPreview(file);
    const nodeKey = insertNodeAtSelection(
      editor,
      () =>
        $createRichMediaNode(
          createBlockId(),
          createMediaPresentation(kind, '', file.name),
          localPreviewUrl ?? undefined,
          0,
        ),
      { afterKey, trailingParagraph: false },
    );
    if (!nodeKey) {
      revokeLocalMediaPreview(localPreviewUrl);
      return;
    }
    const result = await uploadAsset(kind, file, nodeKey);
    if (!result) {
      removeMediaNode(editor, nodeKey);
      revokeLocalMediaPreview(localPreviewUrl);
      return;
    }
    const resolvedPreviewUrl = result.previewUrl ?? localPreviewUrl ?? undefined;
    let completedInCanvas = false;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isRichMediaNode(node)) return;
      node.completeUpload(
        createMediaPresentation(kind, result.asset.id, file.name),
        resolvedPreviewUrl,
      );
      completedInCanvas = true;
    });
    if (!completedInCanvas || (result.previewUrl && result.previewUrl !== localPreviewUrl)) {
      revokeLocalMediaPreview(localPreviewUrl);
    }
    if (kind === 'video') setCaptionTargetVideo(nodeKey);
  };

  const uploadCaptions = async (file: File): Promise<void> => {
    if (!captionTargetVideo) return;
    const captions = await uploadAsset('captions', file, captionTargetVideo);
    if (!captions) return;
    editor.update(() => {
      const node = $getNodeByKey(captionTargetVideo);
      if ($isRichMediaNode(node)) node.setCaptionsAssetId(captions.asset.id);
    });
  };

  return {
    captionTargetVideo,
    mediaUploadError,
    saveMediaToLibrary,
    setSaveMediaToLibrary,
    uploadCaptions,
    uploadMediaIntoCanvas,
    uploading,
  };
}
