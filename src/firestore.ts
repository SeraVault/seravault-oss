import { backendService } from './backend/BackendService';
import type { QueryConstraint, UserProfile } from './backend/BackendInterface';

// Re-export types if needed or define locally to match existing usage
export type { UserProfile };

export interface Folder {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string };
  parent: string | null;
  createdAt: any;
  encryptedKeys?: { [uid: string]: string };
  sharedWith?: string[]; // User IDs that have access to this folder
  userFolders?: { [uid: string]: string | null }; // Per-user folder location for shared folders
  archivedBy?: string[]; // UIDs of users who have archived this folder
}

export interface Group {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string };
  description?: string | { ciphertext: string; nonce: string };
  members: string[] | { ciphertext: string; nonce: string };
  memberKeys?: { [uid: string]: string };
  createdAt: any;
  updatedAt: any;
  isEncrypted?: boolean;
}

// In-memory cache for user profiles — avoids redundant Firestore reads across components
const USER_PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const userProfileCache = new Map<string, { profile: UserProfile | null; fetchedAt: number }>();

export function clearUserProfileCache(): void {
  userProfileCache.clear();
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const cached = userProfileCache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < USER_PROFILE_CACHE_TTL) {
    return cached.profile;
  }
  const profile = await backendService.users.get(uid) as UserProfile | null;
  userProfileCache.set(uid, { profile, fetchedAt: Date.now() });
  return profile;
};

export const getUserPublicProfile = async (uid: string): Promise<{ displayName: string; email: string; publicKey?: string } | null> => {
  const profile = await backendService.users.get(uid) as UserProfile | null;
  if (profile) {
    return {
      displayName: profile.displayName,
      email: profile.email,
      publicKey: profile.publicKey
    };
  } else {
    return null;
  }
};

export const getUserPublicKey = async (uid: string): Promise<string | null> => {
  const profile = await getUserProfile(uid);
  return profile?.publicKey || null;
};

export const getUserByEmail = async (email: string): Promise<{ id: string; profile: UserProfile } | null> => {
  const normalizedEmail = email.toLowerCase();
  
  // First try with normalized email
  let results = await backendService.query.get('users', [
    { type: 'where', field: 'email', operator: '==', value: normalizedEmail }
  ]);
  
  if (results.length > 0) {
    return { id: results[0].id, profile: results[0] as UserProfile };
  }
  
  // If not found, try with original casing
  if (email !== normalizedEmail) {
    results = await backendService.query.get('users', [
      { type: 'where', field: 'email', operator: '==', value: email }
    ]);
    
    if (results.length > 0) {
      return { id: results[0].id, profile: results[0] as UserProfile };
    }
  }
  
  return null;
};

export const updateUserColumnVisibility = async (uid: string, columnVisibility: UserProfile['columnVisibility']) => {
  await backendService.users.update(uid, { columnVisibility });
};

export const createUserProfile = async (uid: string, data: UserProfile) => {
  console.log('🔄 createUserProfile: Starting operation...', {
    uid,
    hasEncryptedPrivateKey: !!data.encryptedPrivateKey,
    displayName: data.displayName
  });

  try {
    const normalizedData = {
      ...data,
      email: data.email.toLowerCase()
    };
    
    await backendService.documents.set('users', uid, normalizedData, { merge: true });
    
    // Invalidate cache so the next getUserProfile call fetches fresh data from Firestore,
    // especially important during account creation where the cache may hold a null entry.
    userProfileCache.delete(uid);
    
    console.log('✅ createUserProfile: Completed successfully');
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('❌ createUserProfile: Failed:', error);
    throw error;
  }
};

export const ensureUserProfile = async (uid: string, email: string | null, displayName: string | null) => {
  console.log('🔍 ensureUserProfile: Checking if profile exists...', { uid, email, displayName });
  
  const maxRetries = 3;
  const retryDelays = [100, 500, 1000];
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const profile = await backendService.documents.get('users', uid);
      
      if (!profile) {
        console.log(`📝 ensureUserProfile: Creating new profile (attempt ${attempt + 1})...`);
        
        // CRITICAL: Never include publicKey or encryptedPrivateKey here.
        // These fields are set ONLY by createUserProfile / keyManagement.ts during explicit key generation.
        // Including them here (even undefined) risks overwriting or wiping them.
        const profileData: Partial<UserProfile> = {
          email: email ? email.toLowerCase() : 'unknown@example.com',
          displayName: displayName || email?.split('@')[0] || 'User',
          theme: 'dark',
          language: 'en',
          columnVisibility: {
            type: true,
            size: true,
            shared: true,
            created: true,
            modified: true,
            owner: true,
          },
          showPrintWarning: true,
        };
        
        // Defensive strip: ensure key fields are never written by ensureUserProfile,
        // regardless of how profileData was constructed above.
        delete (profileData as any).publicKey;
        delete (profileData as any).encryptedPrivateKey;
        
        await backendService.documents.set('users', uid, profileData, { merge: true });
        console.log('✅ ensureUserProfile: Profile created/merged successfully');
        return;
      } else {
        console.log('✅ ensureUserProfile: Profile already exists');
        return;
      }
    } catch (error: unknown) {
      const isPermissionError = error instanceof Error && 
        error.message.includes('Missing or insufficient permissions');
      
      if (isPermissionError && attempt < maxRetries) {
        const delay = retryDelays[attempt];
        console.warn(`⚠️ ensureUserProfile: Permission error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      console.error('❌ ensureUserProfile: Error ensuring profile exists:', error);
      throw error;
    }
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>) => {
  const normalizedUpdates = updates.email
    ? { ...updates, email: updates.email.toLowerCase() }
    : updates;
  await backendService.users.update(uid, normalizedUpdates);
  userProfileCache.delete(uid);
};

export const updateUserRecents = async (uid: string, recentItems: UserProfile['recentItems']) => {
  await backendService.documents.update('users', uid, { recentItems });
};

export const getUserRecents = async (uid: string): Promise<UserProfile['recentItems']> => {
  const profile = await getUserProfile(uid);
  return profile?.recentItems || [];
};

export const createFolder = async (owner: string, name: string, parent: string | null, privateKeyHex: string) => {
  const { FolderEncryptionService } = await import('./services/folderEncryption');
  
  const encryptionResult = await FolderEncryptionService.encryptFolderForUser(
    name,
    owner,
    privateKeyHex
  );

  const folderDocument = FolderEncryptionService.createFolderDocument(
    owner,
    encryptionResult.encryptedMetadata,
    encryptionResult.encryptedKeys,
    parent
  );

  await backendService.documents.add('folders', folderDocument);
};

export const updateFolder = async (folderId: string, updates: Partial<Folder>) => {
  try {
    await backendService.documents.update('folders', folderId, updates);
    console.log('Folder updated successfully');
  } catch (error) {
    console.error('Error updating folder:', error);
    throw error;
  }
};

export const renameFolderWithEncryption = async (folderId: string, newName: string, userId: string) => {
  try {
    const { encryptData, encryptMetadata, bytesToHex } = await import('./crypto/quantumSafeCrypto');
    
    const userProfile = await getUserProfile(userId);
    if (!userProfile?.publicKey) {
      throw new Error('User public key not found. Cannot encrypt folder name.');
    }

    const hexToBytes = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    };

    const publicKey = hexToBytes(userProfile.publicKey);
    const metadataKey = crypto.getRandomValues(new Uint8Array(32));
    
    const encryptedKeyResult = await encryptData(metadataKey, publicKey);
    const encapsulatedKey = encryptedKeyResult.encapsulatedKey;
    const cipherText = encryptedKeyResult.ciphertext;
    
    const combinedKeyData = new Uint8Array(encapsulatedKey.length + cipherText.length);
    combinedKeyData.set(encapsulatedKey, 0);
    combinedKeyData.set(cipherText, encapsulatedKey.length);
    
    const encryptedMetadata = await encryptMetadata(
      { name: newName, size: '0' },
      metadataKey
    );

    await updateFolder(folderId, {
      name: encryptedMetadata.name,
      encryptedKeys: { [userId]: bytesToHex(combinedKeyData) },
    });
  } catch (error) {
    console.error('Error renaming folder with encryption:', error);
    throw error;
  }
};

export const deleteFolder = async (folderId: string) => {
  try {
    console.log(`Starting deletion of folder: ${folderId}`);
    await backendService.documents.delete('folders', folderId);
    console.log(`Successfully deleted folder: ${folderId}`);
  } catch (error) {
    console.error(`Error deleting folder ${folderId}:`, error);
    throw error;
  }
};

// Group management functions
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const createGroup = async (owner: string, name: string, description: string, members: string[]) => {
  const ownerProfile = await getUserProfile(owner);
  if (!ownerProfile?.publicKey) {
    throw new Error('Owner public key not found. Cannot create encrypted group.');
  }

  const allMembers = [owner, ...members];
  const memberPublicKeys = [];
  
  for (const memberId of allMembers) {
    const profile = await getUserProfile(memberId);
    if (!profile?.publicKey) {
      console.warn(`Skipping member ${memberId}: no public key found`);
      continue;
    }
    memberPublicKeys.push({
      userId: memberId,
      publicKey: hexToBytes(profile.publicKey),
    });
  }

  if (memberPublicKeys.length === 0) {
    throw new Error('No valid public keys found for group members.');
  }

  const groupKey = crypto.getRandomValues(new Uint8Array(32));
  
  const { encryptedGroupData, memberKeys } = await encryptGroupData(
    { name, description, members },
    groupKey,
    memberPublicKeys
  );

  const newGroup: Group = {
    owner,
    name: encryptedGroupData.name,
    description: encryptedGroupData.description,
    members: encryptedGroupData.members,
    memberKeys,
    createdAt: backendService.utils.serverTimestamp(),
    updatedAt: backendService.utils.serverTimestamp(),
    isEncrypted: true,
  };
  
  const docId = await backendService.documents.add('groups', newGroup);
  return docId;
};

export const updateGroup = async (groupId: string, updates: Partial<Group>) => {
  try {
    const existingGroup = await backendService.documents.get('groups', groupId) as Group | null;
    
    if (!existingGroup) {
      throw new Error('Group not found');
    }
    
    let finalUpdates = { ...updates };
    
    if (existingGroup.isEncrypted && (updates.name || updates.description || updates.members)) {
      const ownerProfile = await getUserProfile(existingGroup.owner);
      if (!ownerProfile?.publicKey) {
        throw new Error('Owner public key not found. Cannot update encrypted group.');
      }
      
      const currentMembers = typeof existingGroup.members === 'string' 
        ? JSON.parse(existingGroup.members)
        : Array.isArray(existingGroup.members) 
          ? existingGroup.members
          : [];
      
      const updatedMembers = updates.members || currentMembers;
      const allMembers = [existingGroup.owner, ...updatedMembers];
      
      const memberPublicKeys = [];
      for (const memberId of allMembers) {
        const profile = await getUserProfile(memberId);
        if (profile?.publicKey) {
          memberPublicKeys.push({
            userId: memberId,
            publicKey: hexToBytes(profile.publicKey),
          });
        }
      }
      
      const groupKey = crypto.getRandomValues(new Uint8Array(32));
      
      const groupData = {
        name: typeof updates.name === 'string' ? updates.name : 
              (typeof existingGroup.name === 'object' ? '' : existingGroup.name as string),
        description: typeof updates.description === 'string' ? updates.description :
                    (typeof existingGroup.description === 'object' ? '' : existingGroup.description as string || ''),
        members: updatedMembers,
      };
      
      const { encryptedGroupData, memberKeys } = await encryptGroupData(
        groupData,
        groupKey,
        memberPublicKeys
      );
      
      finalUpdates = {
        name: encryptedGroupData.name,
        description: encryptedGroupData.description,
        members: encryptedGroupData.members,
        memberKeys,
      };
    }
    
    await backendService.documents.update('groups', groupId, { 
      ...finalUpdates, 
      updatedAt: backendService.utils.serverTimestamp() 
    });
    console.log('Group updated successfully');
  } catch (error) {
    console.error('Error updating group:', error);
    throw error;
  }
};

export const deleteGroup = async (groupId: string) => {
  await backendService.documents.delete('groups', groupId);
};

export const getUserGroups = async (uid: string, userPrivateKey?: Uint8Array): Promise<Group[]> => {
  console.log('🔍 getUserGroups called for uid:', uid, 'hasPrivateKey:', !!userPrivateKey);
  
  try {
    const groupsData = await backendService.query.get('groups', [
      { type: 'where', field: 'owner', operator: '==', value: uid }
    ]);
    console.log('✅ getDocs succeeded, found', groupsData.length, 'groups');
    
    const groups = groupsData as Group[];
    
    const decryptedGroups = [];
    for (const group of groups) {
      if (group.isEncrypted) {
        try {
          const decrypted = await decryptGroupForUser(group, uid, userPrivateKey);
          decryptedGroups.push(decrypted);
        } catch (error) {
          console.error(`Failed to decrypt group ${group.id}:`, error);
          decryptedGroups.push({ 
            ...group, 
            name: userPrivateKey ? '[Encrypted - Cannot Decrypt]' : '[Encrypted - Login Required]', 
            members: [],
            description: userPrivateKey ? '[Encrypted - Cannot Decrypt]' : '[Encrypted - Login Required]'
          });
        }
      } else {
        decryptedGroups.push(group);
      }
    }
    
    return decryptedGroups;
  } catch (error: any) {
    console.error('❌ failed to fetch user groups:', error);
    if (error?.code === 'permission-denied') {
      console.warn('⚠️ Permission denied fetching user groups, returning empty array');
      return [];
    }
    throw error;
  }
};

export const getAllFoldersForUser = async (uid: string): Promise<Folder[]> => {
  const folders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: uid }
  ]);
  return folders as Folder[];
};

export const getAllAccessibleFoldersForUser = async (uid: string): Promise<Folder[]> => {
  // Get folders owned by the user
  const ownedFolders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: uid }
  ]);

  // Get folders shared with the user
  const sharedFolders = await backendService.query.get('folders', [
    { type: 'where', field: 'sharedWith', operator: 'array-contains', value: uid }
  ]);

  // Combine and deduplicate
  const allFolders = [...ownedFolders, ...sharedFolders];
  const uniqueFolders = Array.from(
    new Map(allFolders.map(folder => [folder.id, folder])).values()
  );

  return uniqueFolders as Folder[];
};

export const getAllFilesInFolder = async (folderId: string | null, userId: string): Promise<any[]> => {
  const files = await backendService.query.get('files', [
    { type: 'where', field: 'sharedWith', operator: 'array-contains', value: userId }
  ]);
  
  return files.filter((file: any) => {
    if (file.userFolders && typeof file.userFolders === 'object') {
      return file.userFolders[userId] === folderId;
    }
    return file.parent === folderId;
  });
};

export const subscribeToFilesInFolder = (
  folderId: string | null, 
  userId: string, 
  onUpdate: (files: any[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    return backendService.query.subscribePath('files', [
      { type: 'where', field: 'sharedWith', operator: 'array-contains', value: userId }
    ], (files) => {
      const filteredFiles = files.filter((file: any) => {
        if (file.userFolders && typeof file.userFolders === 'object') {
          return file.userFolders[userId] === folderId;
        }
        return file.parent === folderId;
      });
      onUpdate(filteredFiles);
    });
  } catch (error: any) {
    console.error('Error in files subscription:', error);
    if (onError) onError(error);
    return () => {};
  }
};

export const getSubfolders = async (parentId: string | null, ownerUid: string): Promise<Folder[]> => {
  const folders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: ownerUid },
    { type: 'where', field: 'parent', operator: '==', value: parentId }
  ]);
  return folders as Folder[];
};

export const getAllFilesRecursively = async (folderId: string | null, userId: string): Promise<any[]> => {
  const allFiles: any[] = [];
  
  const files = await getAllFilesInFolder(folderId, userId);
  allFiles.push(...files);
  
  const subfolders = await getSubfolders(folderId, userId);
  for (const subfolder of subfolders) {
    const subFiles = await getAllFilesRecursively(subfolder.id!, userId);
    allFiles.push(...subFiles);
  }
  
  return allFiles;
};

export const shareFolder = async (
  folderId: string,
  sharedWithUids: string[],
  ownerUserId: string,
  ownerPrivateKey: string,
  recipientUserFolders?: { [uid: string]: string | null }
) => {
  // Get the folder to share
  const folder = await backendService.documents.get('folders', folderId);
  if (!folder) {
    throw new Error('Folder not found');
  }

  // Decrypt the folder's metadata key using the owner's private key
  const { decryptData, encryptData, hexToBytes, bytesToHex } = await import('./crypto/quantumSafeCrypto');

  const ownerEncryptedKey = folder.encryptedKeys?.[ownerUserId];
  if (!ownerEncryptedKey) {
    throw new Error('Owner encrypted key not found for folder');
  }

  const ownerKeyData = hexToBytes(ownerEncryptedKey);
  const ownerIv = ownerKeyData.slice(0, 12);
  const ownerEncapsulatedKey = ownerKeyData.slice(12, 12 + 1088);
  const ownerCiphertext = ownerKeyData.slice(12 + 1088);
  const ownerPrivateKeyBytes = hexToBytes(ownerPrivateKey);

  const folderKey = await decryptData(
    { iv: ownerIv, encapsulatedKey: ownerEncapsulatedKey, ciphertext: ownerCiphertext },
    ownerPrivateKeyBytes
  );

  // Encrypt the folder key for each new recipient using their public key
  const updatedEncryptedKeys = { ...(folder.encryptedKeys || {}) };

  await Promise.all(sharedWithUids.map(async (uid) => {
    if (updatedEncryptedKeys[uid]) return; // already has a key

    const profile = await getUserProfile(uid);
    if (!profile?.publicKey) {
      console.warn(`No public key for user ${uid}, skipping folder key encryption`);
      return;
    }

    const recipientPublicKey = hexToBytes(profile.publicKey);
    const encryptedKeyResult = await encryptData(folderKey, recipientPublicKey);
    const combined = new Uint8Array(
      encryptedKeyResult.iv.length +
      encryptedKeyResult.encapsulatedKey.length +
      encryptedKeyResult.ciphertext.length
    );
    combined.set(encryptedKeyResult.iv, 0);
    combined.set(encryptedKeyResult.encapsulatedKey, encryptedKeyResult.iv.length);
    combined.set(encryptedKeyResult.ciphertext, encryptedKeyResult.iv.length + encryptedKeyResult.encapsulatedKey.length);
    updatedEncryptedKeys[uid] = bytesToHex(combined);
  }));

  // Update folder with new shared users
  const currentSharedWith = folder.sharedWith || [];
  const updatedSharedWith = [...new Set([...currentSharedWith, ...sharedWithUids])];

  // Initialize userFolders for new users using provided mapping or default to root
  const userFolders = { ...(folder.userFolders || {}) };
  sharedWithUids.forEach(uid => {
    if (!(uid in userFolders)) {
      userFolders[uid] = recipientUserFolders?.[uid] ?? null;
    }
  });

  await backendService.documents.update('folders', folderId, {
    sharedWith: updatedSharedWith,
    userFolders,
    encryptedKeys: updatedEncryptedKeys,
  });
};

export const getFolderSharingPermissions = async (folderId: string | null): Promise<string[]> => {
  if (!folderId) return [];
  
  const folder = await backendService.documents.get('folders', folderId);
  if (!folder || !folder.sharedWith) return [];
  
  return folder.sharedWith;
};

export const encryptGroupData = async (
  groupData: { name: string; description: string; members: string[] },
  groupKey: Uint8Array,
  memberPublicKeys: { userId: string; publicKey: Uint8Array }[]
): Promise<{
  encryptedGroupData: {
    name: { ciphertext: string; nonce: string };
    description: { ciphertext: string; nonce: string };
    members: { ciphertext: string; nonce: string };
  };
  memberKeys: { [userId: string]: string };
}> => {
  const { encryptData } = await import('./crypto/quantumSafeCrypto');
  
  const nameNonce = crypto.getRandomValues(new Uint8Array(12));
  const descNonce = crypto.getRandomValues(new Uint8Array(12));
  const membersNonce = crypto.getRandomValues(new Uint8Array(12));
  
  const aesKey = await crypto.subtle.importKey(
    'raw',
    groupKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const nameData = new TextEncoder().encode(groupData.name);
  const encryptedName = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nameNonce },
    aesKey,
    nameData
  );
  
  const descData = new TextEncoder().encode(groupData.description);
  const encryptedDesc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: descNonce },
    aesKey,
    descData
  );
  
  const membersData = new TextEncoder().encode(JSON.stringify(groupData.members));
  const encryptedMembers = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: membersNonce },
    aesKey,
    membersData
  );
  
  const memberKeys: { [userId: string]: string } = {};
  
  for (const { userId, publicKey } of memberPublicKeys) {
    const encryptedKey = await encryptData(groupKey, publicKey);
    const keyData = new Uint8Array(
      encryptedKey.iv.length + encryptedKey.encapsulatedKey.length + encryptedKey.ciphertext.length
    );
    keyData.set(encryptedKey.iv, 0);
    keyData.set(encryptedKey.encapsulatedKey, encryptedKey.iv.length);
    keyData.set(encryptedKey.ciphertext, encryptedKey.iv.length + encryptedKey.encapsulatedKey.length);
    memberKeys[userId] = bytesToHex(keyData);
  }
  
  return {
    encryptedGroupData: {
      name: {
        ciphertext: bytesToHex(new Uint8Array(encryptedName)),
        nonce: bytesToHex(nameNonce),
      },
      description: {
        ciphertext: bytesToHex(new Uint8Array(encryptedDesc)),
        nonce: bytesToHex(descNonce),
      },
      members: {
        ciphertext: bytesToHex(new Uint8Array(encryptedMembers)),
        nonce: bytesToHex(membersNonce),
      },
    },
    memberKeys,
  };
};

export const decryptGroupForUser = async (
  group: Group, 
  userId: string,
  userPrivateKey?: Uint8Array
): Promise<Group> => {
  if (!group.isEncrypted || !group.memberKeys?.[userId]) {
    return group;
  }
  
  if (!userPrivateKey) {
    return {
      ...group,
      name: '[Encrypted - Login Required]',
      description: '[Encrypted - Login Required]',
      members: [],
    };
  }
  
  try {
    const { decryptData } = await import('./crypto/quantumSafeCrypto');
    
    const encryptedGroupKey = hexToBytes(group.memberKeys[userId]);
    
    if (encryptedGroupKey.length < 12 + 1088) {
      console.error(`Invalid encrypted group key format.`);
      throw new Error('Invalid encrypted group key format');
    }
    
    const iv = encryptedGroupKey.slice(0, 12);
    const encapsulatedKey = encryptedGroupKey.slice(12, 12 + 1088);
    const ciphertext = encryptedGroupKey.slice(12 + 1088);
    
    const groupKey = await decryptData(
      { iv, encapsulatedKey, ciphertext },
      userPrivateKey
    );
    
    const decryptedGroup = await decryptGroupDataWithKey(group, groupKey);
    return decryptedGroup;
    
  } catch (error) {
    console.error('Error decrypting group:', error);
    throw error;
  }
};

export const decryptGroupDataWithKey = async (group: Group, groupKey: Uint8Array): Promise<Group> => {
  if (!group.isEncrypted) {
    return group;
  }
  
  const aesKey = await crypto.subtle.importKey(
    'raw',
    groupKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  let name = '';
  if (typeof group.name === 'object') {
    const nameNonce = hexToBytes(group.name.nonce);
    const nameCiphertext = hexToBytes(group.name.ciphertext);
    const decryptedName = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nameNonce },
      aesKey,
      nameCiphertext
    );
    name = new TextDecoder().decode(decryptedName);
  }
  
  let description = '';
  if (typeof group.description === 'object') {
    const descNonce = hexToBytes(group.description.nonce);
    const descCiphertext = hexToBytes(group.description.ciphertext);
    const decryptedDesc = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: descNonce },
      aesKey,
      descCiphertext
    );
    description = new TextDecoder().decode(decryptedDesc);
  }
  
  let members: string[] = [];
  if (typeof group.members === 'object' && 'nonce' in group.members && 'ciphertext' in group.members) {
    const membersNonce = hexToBytes(group.members.nonce);
    const membersCiphertext = hexToBytes(group.members.ciphertext);
    const decryptedMembers = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: membersNonce },
      aesKey,
      membersCiphertext
    );
    members = JSON.parse(new TextDecoder().decode(decryptedMembers));
  } else if (Array.isArray(group.members)) {
    members = group.members;
  }
  
  return {
    ...group,
    name,
    description,
    members,
  };
};

export const migrateGroupToEncrypted = async (groupId: string): Promise<void> => {
  try {
    const group = await backendService.documents.get('groups', groupId) as Group | null;
    
    if (!group) {
      throw new Error('Group not found');
    }
    
    if (group.isEncrypted) {
      console.log(`Group ${groupId} is already encrypted`);
      return;
    }
    
    const ownerProfile = await getUserProfile(group.owner);
    if (!ownerProfile?.publicKey) {
      throw new Error('Owner public key not found. Cannot encrypt group.');
    }
    
    const allMembers = [group.owner, ...group.members as string[]];
    const memberPublicKeys = [];
    
    for (const memberId of allMembers) {
      const profile = await getUserProfile(memberId);
      if (profile?.publicKey) {
        memberPublicKeys.push({
          userId: memberId,
          publicKey: hexToBytes(profile.publicKey),
        });
      }
    }
    
    if (memberPublicKeys.length === 0) {
      throw new Error('No valid public keys found for group members.');
    }
    
    const groupKey = crypto.getRandomValues(new Uint8Array(32));
    
    const { encryptedGroupData, memberKeys } = await encryptGroupData(
      {
        name: group.name as string,
        description: group.description as string || '',
        members: group.members as string[],
      },
      groupKey,
      memberPublicKeys
    );
    
    await backendService.documents.update('groups', groupId, {
      name: encryptedGroupData.name,
      description: encryptedGroupData.description,
      members: encryptedGroupData.members,
      memberKeys,
      isEncrypted: true,
      updatedAt: backendService.utils.serverTimestamp(),
    });
    
    console.log(`Successfully migrated group ${groupId} to encrypted format`);
    
  } catch (error) {
    console.error(`Failed to migrate group ${groupId}:`, error);
    throw error;
  }
};

export const migrateAllUserGroupsToEncrypted = async (userId: string): Promise<void> => {
  try {
    const groups = await backendService.query.get('groups', [
      { type: 'where', field: 'owner', operator: '==', value: userId },
      { type: 'where', field: 'isEncrypted', operator: '!=', value: true }
    ]);
    
    for (const group of groups) {
      try {
        await migrateGroupToEncrypted(group.id);
      } catch (error) {
        console.error(`Failed to migrate group ${group.id}:`, error);
      }
    }
    
    console.log(`Migration completed for user ${userId}`);
  } catch (error) {
    console.error(`Failed to migrate groups for user ${userId}:`, error);
    throw error;
  }
};

// Archive management functions

/**
 * Archives a file for the given user (adds uid to archivedBy array).
 * Per-user: archiving a shared file only affects the archiving user's view.
 */
export const archiveFile = async (fileId: string, uid: string): Promise<void> => {
  const file = await backendService.documents.get('files', fileId);
  if (!file) throw new Error('File not found');

  const current: string[] = file.archivedBy || [];
  if (!current.includes(uid)) {
    await backendService.documents.update('files', fileId, {
      archivedBy: [...current, uid],
    });
  }
};

/**
 * Restores a file from archive for the given user (removes uid from archivedBy array).
 */
export const unarchiveFile = async (fileId: string, uid: string): Promise<void> => {
  const file = await backendService.documents.get('files', fileId);
  if (!file) throw new Error('File not found');

  const current: string[] = file.archivedBy || [];
  await backendService.documents.update('files', fileId, {
    archivedBy: current.filter((id: string) => id !== uid),
  });
};

/**
 * Archives a folder and all files/subfolders within it for the given user.
 * Recursively stamps archivedBy on each item.
 */
export const archiveFolder = async (folderId: string, uid: string): Promise<void> => {
  // Archive the folder itself
  const folder = await backendService.documents.get('folders', folderId);
  if (folder) {
    const current: string[] = folder.archivedBy || [];
    if (!current.includes(uid)) {
      await backendService.documents.update('folders', folderId, {
        archivedBy: [...current, uid],
      });
    }
  }

  // Archive all files in the folder
  const files = await backendService.query.get('files', [
    { type: 'where', field: 'owner', operator: '==', value: uid },
  ]);

  const folderFiles = files.filter((f: any) => {
    if (f.userFolders && typeof f.userFolders === 'object') {
      return f.userFolders[uid] === folderId;
    }
    return f.parent === folderId;
  });

  for (const file of folderFiles) {
    const current: string[] = file.archivedBy || [];
    if (!current.includes(uid)) {
      await backendService.documents.update('files', file.id, {
        archivedBy: [...current, uid],
      });
    }
  }

  // Recurse into subfolders
  const subfolders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: uid },
    { type: 'where', field: 'parent', operator: '==', value: folderId },
  ]);

  for (const subfolder of subfolders) {
    await archiveFolder(subfolder.id, uid);
  }
};

/**
 * Restores a folder and all files/subfolders within it from archive for the given user.
 */
export const unarchiveFolder = async (folderId: string, uid: string): Promise<void> => {
  // Unarchive the folder itself
  const folder = await backendService.documents.get('folders', folderId);
  if (folder) {
    const current: string[] = folder.archivedBy || [];
    await backendService.documents.update('folders', folderId, {
      archivedBy: current.filter((id: string) => id !== uid),
    });
  }

  // Unarchive all files in the folder
  const files = await backendService.query.get('files', [
    { type: 'where', field: 'owner', operator: '==', value: uid },
  ]);

  const folderFiles = files.filter((f: any) => {
    if (f.userFolders && typeof f.userFolders === 'object') {
      return f.userFolders[uid] === folderId;
    }
    return f.parent === folderId;
  });

  for (const file of folderFiles) {
    const current: string[] = file.archivedBy || [];
    await backendService.documents.update('files', file.id, {
      archivedBy: current.filter((id: string) => id !== uid),
    });
  }

  // Recurse into subfolders
  const subfolders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: uid },
    { type: 'where', field: 'parent', operator: '==', value: folderId },
  ]);

  for (const subfolder of subfolders) {
    await unarchiveFolder(subfolder.id, uid);
  }
};

/**
 * Get all archived files for a user (owned + shared that the user has archived).
 * Firestore only allows one array-contains per query, so we query by archivedBy alone
 * and let client-side access control (the user can only archive files they have access to)
 * ensure correctness.
 */
export const getArchivedFiles = async (uid: string): Promise<any[]> => {
  // Single query: all files where uid is in archivedBy (covers both owned and shared)
  const archivedFiles = await backendService.query.get('files', [
    { type: 'where', field: 'archivedBy', operator: 'array-contains', value: uid },
  ]);

  return archivedFiles.filter((f: any) => f.fileType !== 'attachment');
};

/**
 * Get all archived folders for a user.
 */
export const getArchivedFolders = async (uid: string): Promise<Folder[]> => {
  const folders = await backendService.query.get('folders', [
    { type: 'where', field: 'owner', operator: '==', value: uid },
    { type: 'where', field: 'archivedBy', operator: 'array-contains', value: uid },
  ]);
  return folders as Folder[];
};

export const subscribeToUserProfile = (uid: string, callback: (profile: UserProfile | null) => void): () => void => {
  return backendService.realtime.subscribeToDocument('users', uid, (data) => {
    if (data && typeof data === 'object') {
      callback({ ...data } as unknown as UserProfile);
    } else {
      callback(null);
    }
  });
};
