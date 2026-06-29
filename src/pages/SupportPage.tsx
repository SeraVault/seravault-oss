// @ts-nocheck
import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Email as EmailIcon,
  ExpandMore as ExpandMoreIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
  HelpOutline as HelpIcon,
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { backendService } from '../backend/BackendService';

const SupportPage: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !message.trim()) {
      setError(t('support.pleaseFieldsAll', 'Please fill in all fields'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await backendService.functions.call('sendSupportEmail', {
        subject: subject.trim(),
        message: message.trim(),
        userName: user?.displayName || '',
      });

      setSuccess(true);
      setSubject('');
      setMessage('');
      
      // Reset success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error('Error sending support email:', err);
      
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('support.failedSendEmailRetry', 'Failed to send support email. Please try again later.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const faqs = [
    {
      question: t('support.faqUpgradePlan', 'How do I upgrade my plan?'),
      answer: t('support.faqUpgradePlanAnswer', 'Go to Settings > Subscription to view available plans and upgrade. You can choose from Basic, Personal, or Professional plans based on your storage needs.'),
    },
    {
      question: t('support.faqDataSecurity', 'How secure is my data?'),
      answer: t('support.faqDataSecurityAnswer', 'Your data is protected with post-quantum encryption (ML-KEM-768 + AES-256-GCM). Your encryption keys are generated on your device and never leave it unencrypted. Even SeraVault cannot access your data.'),
    },
    {
      question: t('support.faqShareFiles', 'Can I share files with non-users?'),
      answer: t('support.faqShareFilesAnswer', 'Currently, file sharing is only available between SeraVault users. You can invite others to join SeraVault, and once they create an account, you can share files securely with them.'),
    },
    {
      question: t('support.faqForgotPassphrase', 'What happens if I forget my passphrase?'),
      answer: t('support.faqForgotPassphraseAnswer', 'Your passphrase is the only way to decrypt your data. If you forget it, your data cannot be recovered. We recommend setting up hardware key authentication as a backup method, or storing your passphrase in a secure password manager.'),
    },
    {
      question: t('support.faqCancelSubscription', 'How do I cancel my subscription?'),
      answer: t('support.faqCancelSubscriptionAnswer', "Go to Settings > Subscription and click \"Cancel Subscription\". Your subscription will remain active until the end of your billing period, after which you'll be downgraded to the free plan."),
    },
    {
      question: t('support.faqFileTypes', 'What file types are supported?'),
      answer: t('support.faqFileTypesAnswer', 'SeraVault supports all file types including documents (PDF, DOCX, TXT), images (JPG, PNG, GIF), videos, and encrypted forms. Maximum file size depends on your subscription plan.'),
    },
  ];

  return (
    <Container maxWidth="md" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      <Box sx={{ mb: isMobile ? 2 : 4, textAlign: 'center' }}>
        <EmailIcon sx={{ fontSize: isMobile ? 40 : 60, color: 'primary.main', mb: 2 }} />
        <Typography variant={isMobile ? 'h4' : 'h3'} gutterBottom>
          {t('support.supportPageTitle', 'Support')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('support.supportPageSubtitle', 'Get help from our support team')}
        </Typography>
      </Box>

      {/* FAQ Section */}
      <Paper elevation={2} sx={{ p: isMobile ? 2 : 3, mb: isMobile ? 2 : 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <HelpIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h5">
            {t('support.faqTitle', 'Frequently Asked Questions')}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        
        {faqs.map((faq, index) => (
          <Accordion key={index} elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={500}>{faq.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary">
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* Contact Form */}
      <Paper elevation={2} sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SendIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h5">
            {t('support.contactSupportTitle', 'Contact Support')}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {success && (
          <Alert 
            severity="success" 
            icon={<CheckCircleIcon />}
            sx={{ mb: 3 }}
          >
            <strong>{t('support.messageSentSuccess', 'Message sent successfully!')}</strong> {t('support.messageSentDetails', "You will receive a confirmation email shortly. We'll respond to your request within 24-48 hours.")}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label={t('support.subject', 'Subject')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('support.subjectPlaceholder', 'Brief description of your issue')}
              required
              disabled={loading}
              inputProps={{ maxLength: 200 }}
              helperText={t('support.charactersCount', '{{count}}/{{max}} characters', { count: subject.length, max: 200 })}
            />
          </Box>

          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              multiline
              rows={8}
              label={t('support.message', 'Message')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('support.messagePlaceholder', 'Please describe your issue in detail. Include any error messages, steps to reproduce, and what you expected to happen.')}
              required
              disabled={loading}
              inputProps={{ maxLength: 2000 }}
              helperText={t('support.charactersCount', '{{count}}/{{max}} characters', { count: message.length, max: 2000 })}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !subject.trim() || !message.trim()}
              startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
            >
              {loading ? t('support.sending', 'Sending...') : t('support.sendMessage', 'Send Message')}
            </Button>

            {user?.email && (
              <Typography variant="body2" color="text.secondary">
                {t('support.repliesSentTo', 'Replies will be sent to:')} <strong>{user.email}</strong>
              </Typography>
            )}
          </Box>
        </form>
      </Paper>

      {/* Additional Resources */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('support.needImmediateHelp', 'Need immediate help? Check out our')}{' '}
          <Link to="/help" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {t('support.helpCenter', 'Help Center')}
          </Link>
          {' '}{t('support.helpCenterLink', 'for quick answers and guides.')}
        </Typography>
      </Box>
    </Container>
  );
};

export default SupportPage;
