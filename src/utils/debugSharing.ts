import { backendService } from '../backend/BackendService';

export const debugSharedFilesForUser = async (userId: string) => {
  console.log(`🔍 Debug: Checking shared files for user ${userId}`);
  
  try {
    // Try to get user profile first
    const userProfile = await backendService.documents.get('users', userId);
    if (!userProfile) {
      console.error('❌ User document does not exist');
      return;
    }
    
    console.log('✅ User profile found:', {
      email: userProfile.email,
      displayName: userProfile.displayName,
      hasPublicKey: !!userProfile.publicKey
    });
    
    // Query for files where user is in sharedWith array
    const sharedFiles = await backendService.query.get('files', [
      { field: 'sharedWith', operator: 'array-contains', value: userId }
    ]);
    
    console.log(`📊 Found ${sharedFiles.length} files shared with user`);
    
    sharedFiles.forEach((fileData, index) => {
      console.log(`📄 Shared file ${index + 1}:`, {
        id: fileData.id,
        name: fileData.name,
        owner: fileData.owner,
        sharedWith: fileData.sharedWith,
        hasEncryptedKey: !!fileData.encryptedKeys[userId]
      });
    });
    
  } catch (error) {
    console.error('❌ Error debugging shared files:', error);
  }
};

export const debugAllUsersWithEmail = async (email: string) => {
  console.log(`🔍 Debug: Finding all users with email ${email}`);
  
  try {
    const users = await backendService.query.get('users', [
      { field: 'email', operator: '==', value: email }
    ]);
    
    console.log(`👥 Found ${users.length} users with email ${email}`);
    
    users.forEach((userData, index) => {
      console.log(`👤 User ${index + 1}:`, {
        id: userData.id,
        email: userData.email,
        displayName: userData.displayName,
        hasPublicKey: !!userData.publicKey
      });
    });
    
  } catch (error) {
    console.error('❌ Error debugging users:', error);
  }
};