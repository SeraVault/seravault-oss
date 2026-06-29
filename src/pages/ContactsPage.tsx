import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ContactManager from '../components/ContactManager';
import CreationFAB from '../components/CreationFAB';
import { Container, Snackbar, Alert, useTheme, useMediaQuery } from '@mui/material';
import { useAuth } from '../auth/AuthContext';

const ContactsPage: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialTab, setInitialTab] = useState<number>(0);
  const [inviteMessage, setInviteMessage] = useState<string>('');
  const [showInviteSnackbar, setShowInviteSnackbar] = useState(false);
  const { user } = useAuth();

  const handleInvitationAccept = useCallback(async (invitationId: string) => {
    if (!user) {
      console.log('[ContactsPage] User not available yet, waiting...');
      return;
    }

    console.log('[ContactsPage] Accepting invitation:', invitationId, 'for user:', user.uid);

    try {
      const { backendService } = await import('../backend/BackendService');

      const result = await backendService.functions.call<
        { invitationId: string },
        { contactId: string; inviterName: string; inviteeName: string }
      >('acceptInvitation', { invitationId });

      console.log('[ContactsPage] Invitation accepted via Cloud Function:', result);

      setInviteMessage(t('contacts.connectedWith', 'Connected with {{name}}!', { name: result.inviterName }));
      setShowInviteSnackbar(true);
      setInitialTab(0);
    } catch (error: any) {
      console.error('[ContactsPage] Error accepting invitation:', error);
      const code = error?.code;
      if (code === 'functions/not-found') {
        setInviteMessage(t('contacts.invitationNotFound', 'Invitation not found or expired'));
      } else if (code === 'functions/failed-precondition') {
        setInviteMessage(t('contacts.invitationAlreadyUsed', 'This invitation has already been used or expired'));
      } else {
        setInviteMessage(t('contacts.invitationAcceptError', 'Failed to accept invitation. Please try again.'));
      }
      setShowInviteSnackbar(true);
    } finally {
      searchParams.delete('invite');
      setSearchParams(searchParams, { replace: true });
    }
  }, [user, searchParams, setSearchParams, t]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const inviteParam = searchParams.get('invite');
    
    if (tabParam === 'requests') {
      setInitialTab(1); // Switch to requests tab
      // Remove the query parameter after processing
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
    
    // Handle invitation auto-accept
    if (inviteParam && user) {
      handleInvitationAccept(inviteParam);
    }
  }, [searchParams, setSearchParams, user, handleInvitationAccept]);

  return (
    <>
      <Container maxWidth="lg" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
        <ContactManager initialTab={initialTab} />
      </Container>

      <CreationFAB
        onCreateFolder={() => {}} // Not applicable on contacts page
        onUploadFiles={() => {}} // Not applicable on contacts page
        onCreateForm={() => {
          // Navigate to vault and open form builder
          window.location.href = '/#form';
        }}
        onCreateChat={() => {
          // Navigate to vault and open chat dialog
          window.location.href = '/#chat';
        }}
      />

      <Snackbar
        open={showInviteSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowInviteSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowInviteSnackbar(false)} 
          severity={inviteMessage.includes('Failed') || inviteMessage.includes('expired') || inviteMessage.includes('not found') ? 'error' : 'success'}
          sx={{ width: '100%' }}
        >
          {inviteMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ContactsPage;