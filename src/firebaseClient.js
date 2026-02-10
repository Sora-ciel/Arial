import { firebaseConfig, firebaseSyncNamespace } from '../firebase.ts';

export { firebaseConfig, firebaseSyncNamespace };

export function isFirebaseConfigured() {
  return false;
}

export function getCurrentUser() {
  return null;
}

export async function onAuthStateChange() {
  return () => {};
}

export async function signInWithGoogle() {
  return null;
}

export async function signOutUser() {
  return null;
}

export async function loadRemoteFile() {
  return null;
}

export async function loadRemoteIndex() {
  return {};
}

export async function saveRemoteFile() {
  return null;
}

export async function deleteRemoteFile() {
  return null;
}

export async function uploadAttachmentFromDataUrl() {
  return null;
}

export async function resolveAttachmentUrl() {
  return null;
}

export async function resolveAttachmentURL() {
  return null;
}
