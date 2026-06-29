# Backend Migration Guide

This guide shows how to migrate from direct Firebase calls to the centralized backend service.

## Quick Reference

### Authentication
```typescript
// Before:
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
await signInWithEmailAndPassword(auth, email, password);

// After:
import { backendService } from '../backend/BackendService';
await backendService.auth.signIn(email, password);
```

### User Profiles
```typescript
// Before:
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
const docRef = doc(db, 'users', userId);
const docSnap = await getDoc(docRef);

// After:
import { backendService } from '../backend/BackendService';
const profile = await backendService.users.get(userId);
```

### Files
```typescript
// Before:
import { collection, query, where, getDocs } from 'firebase/firestore';
const q = query(collection(db, 'files'), where('owner', '==', userId));
const snapshot = await getDocs(q);

// After:
import { backendService } from '../backend/BackendService';
const files = await backendService.files.getUserFiles(userId);
```

### Storage
```typescript
// Before:
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
const storageRef = ref(storage, path);
await uploadBytes(storageRef, data);

// After:
import { backendService } from '../backend/BackendService';
await backendService.storage.upload(path, data);
```

## Migration Strategy

### Phase 1: Core Services ✅ DONE
- [x] Create BackendInterface.ts
- [x] Create FirebaseBackend.ts
- [x] Create BackendService.ts
- [x] Update AuthContext ✅

### Phase 2: Key Components (Priority)
- [ ] Update MainContent.tsx
- [ ] Update firestore.ts services
- [ ] Update storage operations
- [ ] Update contact services

### Phase 3: All Components
- [ ] Systematically update all remaining components
- [ ] Remove direct Firebase imports
- [ ] Test thoroughly

### Phase 4: Cleanup
- [ ] Remove old firebase.ts exports
- [ ] Update all import statements
- [ ] Verify no direct Firebase calls remain

## Benefits After Migration

1. **Easy Backend Switching**: Change one line in BackendService.ts
2. **Type Safety**: Consistent types across all backend operations
3. **Testing**: Easy to mock entire backend for testing
4. **Maintenance**: All backend logic in one place
5. **Future-Proof**: Ready for any backend provider

## File Update Pattern

For each component:
1. Replace Firebase imports with `import { backendService } from '../backend/BackendService'`
2. Replace direct Firebase calls with `backendService.{domain}.{method}()`
3. Update types to use backend interface types
4. Test functionality

## Example Component Migration

```typescript
// Before: components/SomeComponent.tsx
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const updateSomething = async (id: string, data: any) => {
  await updateDoc(doc(db, 'collection', id), data);
};

// After: components/SomeComponent.tsx
import { backendService } from '../backend/BackendService';

const updateSomething = async (id: string, data: any) => {
  await backendService.files.update(id, data); // or appropriate service
};
```

## Testing Backend Switching

Once migration is complete, you can easily test different backends:

```typescript
// In browser console:
console.log('Current backend:', window.backendService.getCurrentBackendType());

// To switch backends (when implemented):
// window.backendService.switchBackend(supabaseBackend);
```