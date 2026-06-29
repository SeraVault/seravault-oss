import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Container,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Divider,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ExpandMore,
  Security,
  VpnKey,
  Share,
  CloudUpload,
  Business,
  HealthAndSafety,
  School,
  Gavel,
  ShieldOutlined,
  LockOutlined,
  Key,
  Computer,
} from '@mui/icons-material';

const SecurityPage: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Container maxWidth="lg" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      {/* Header */}
        <Box sx={{ textAlign: 'center', mb: isMobile ? 3 : 6 }}>
          <Typography variant={isMobile ? 'h4' : 'h3'} component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            {t('security.title')}
          </Typography>
          <Typography variant={isMobile ? 'body1' : 'h6'} color="text.secondary" sx={{ mb: 3 }}>
            {t('security.subtitle')}
          </Typography>
          <Alert severity="success" sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <ShieldOutlined sx={{ mr: 1 }} />
            {t('security.quantumResistantBadge')}
          </Alert>
        </Box>

        {/* What is Post-Quantum Cryptography */}
        <Paper elevation={2} sx={{ p: isMobile ? 2 : 4, mb: isMobile ? 2 : 4 }}>
          <Typography variant={isMobile ? 'h5' : 'h4'} gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Computer sx={{ mr: 2, color: 'primary.main' }} />
            {t('security.whatIsPQC')}
          </Typography>
          <Typography variant="body1" paragraph>
            {t('security.quantumThreatIntro')}
          </Typography>
          <Typography variant="body1" paragraph>
            {t('security.quantumThreatDesc')}
          </Typography>

          <Box sx={{ mt: 3, p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>{t('security.keyTechnologies')}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip label={t('security.mlKem768Chip')} color="primary" />
              <Chip label={t('security.aesgcm256Chip')} color="success" />
              <Chip label={t('security.chaCha20Chip')} color="info" />
              <Chip label={t('security.argon2idChip')} color="error" />
              <Chip label={t('security.webAuthnChip')} color="secondary" />
            </Box>
          </Box>
        </Paper>

        {/* How It Works */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Security sx={{ mr: 2, color: 'primary.main' }} />
            {t('security.howEncryptionWorks')}
          </Typography>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <Key sx={{ mr: 1, verticalAlign: 'middle' }} />
                {t('security.keyGenTitle')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                {t('security.keyGenDesc')}
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><VpnKey color="primary" /></ListItemIcon>
                  <ListItemText
                    primary={t('security.keyGenPublicKey')}
                    secondary={t('security.keyGenPublicKeyDesc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><LockOutlined color="secondary" /></ListItemIcon>
                  <ListItemText
                    primary={t('security.keyGenPrivateKey')}
                    secondary={t('security.keyGenPrivateKeyDesc')}
                  />
                </ListItem>
              </List>
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  {t('security.keyGenWhyMlKem')}
                </Typography>
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <CloudUpload sx={{ mr: 1, verticalAlign: 'middle' }} />
                {t('security.fileEncTitle')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                {t('security.fileEncDesc')}
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary={t('security.fileEncStep1')}
                    secondary={t('security.fileEncStep1Desc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.fileEncStep2')}
                    secondary={t('security.fileEncStep2Desc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.fileEncStep3')}
                    secondary={t('security.fileEncStep3Desc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.fileEncStep4')}
                    secondary={t('security.fileEncStep4Desc')}
                  />
                </ListItem>
              </List>
              <Alert severity="success" sx={{ mt: 2 }}>
                {t('security.fileEncHybridNote')}
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <Share sx={{ mr: 1, verticalAlign: 'middle' }} />
                {t('security.secureSharingTitle')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                {t('security.secureSharingDesc')}
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary={t('security.secureSharingOneFile')}
                    secondary={t('security.secureSharingOneFileDesc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.secureSharingPerRecipient')}
                    secondary={t('security.secureSharingPerRecipientDesc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.secureSharingZeroKnowledge')}
                    secondary={t('security.secureSharingZeroKnowledgeDesc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.secureSharingGranular')}
                    secondary={t('security.secureSharingGranularDesc')}
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <HealthAndSafety sx={{ mr: 1, verticalAlign: 'middle' }} />
                {t('security.passphraseProtTitle')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                {t('security.passphraseProtDesc')}
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary={t('security.passphraseProtArgon2id')}
                    secondary={t('security.passphraseProtArgon2idDesc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.passphraseProtChaCha20')}
                    secondary={t('security.passphraseProtChaCha20Desc')}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('security.passphraseProtSalt')}
                    secondary={t('security.passphraseProtSaltDesc')}
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>
        </Paper>

        {/* Use Cases */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Business sx={{ mr: 2, color: 'primary.main' }} />
            {t('security.useCasesTitle')}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Business sx={{ mr: 1, color: 'primary.main' }} />
                  {t('security.useCaseBusiness')}
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseBusinessConf')} secondary={t('security.useCaseBusinessConfDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseBusinessCustomer')} secondary={t('security.useCaseBusinessCustomerDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseBusinessIP')} secondary={t('security.useCaseBusinessIPDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseBusinessCompliance')} secondary={t('security.useCaseBusinessComplianceDesc')} />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Gavel sx={{ mr: 1, color: 'secondary.main' }} />
                  {t('security.useCaseLegal')}
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseLegalComms')} secondary={t('security.useCaseLegalCommsDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseLegalCase')} secondary={t('security.useCaseLegalCaseDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseLegalClient')} secondary={t('security.useCaseLegalClientDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseLegalCourt')} secondary={t('security.useCaseLegalCourtDesc')} />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <HealthAndSafety sx={{ mr: 1, color: 'success.main' }} />
                  {t('security.useCaseHealthcare')}
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseHealthcarePatient')} secondary={t('security.useCaseHealthcarePatientDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseHealthcareResearch')} secondary={t('security.useCaseHealthcareResearchDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseHealthcareInsurance')} secondary={t('security.useCaseHealthcareInsuranceDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCaseHealthcareTele')} secondary={t('security.useCaseHealthcareTeleDesc')} />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <School sx={{ mr: 1, color: 'info.main' }} />
                  {t('security.useCasePersonal')}
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary={t('security.useCasePersonalDocs')} secondary={t('security.useCasePersonalDocsDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCasePersonalFinancial')} secondary={t('security.useCasePersonalFinancialDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCasePersonalPhotos')} secondary={t('security.useCasePersonalPhotosDesc')} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary={t('security.useCasePersonalComms')} secondary={t('security.useCasePersonalCommsDesc')} />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Box>
        </Paper>

        {/* Security Guarantees */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ShieldOutlined sx={{ mr: 2, color: 'success.main' }} />
            {t('security.securityGuaranteesTitle')}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
            <Alert severity="success" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>{t('security.quantumResistantGuarantee')}</Typography>
              <Typography variant="body2">
                {t('security.quantumResistantGuaranteeDesc')}
              </Typography>
            </Alert>

            <Alert severity="info" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>{t('security.zeroKnowledgeGuarantee')}</Typography>
              <Typography variant="body2">
                {t('security.zeroKnowledgeGuaranteeDesc')}
              </Typography>
            </Alert>

            <Alert severity="warning" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>{t('security.forwardSecrecyGuarantee')}</Typography>
              <Typography variant="body2">
                {t('security.forwardSecrecyGuaranteeDesc')}
              </Typography>
            </Alert>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>{t('security.technicalStandards')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label={t('security.mlKem768Standard')} color="primary" />
            <Chip label={t('security.nistPostQuantum')} color="secondary" />
            <Chip label={t('security.fips1402')} color="success" />
            <Chip label={t('security.commonCriteria')} color="info" />
            <Chip label={t('security.nsaSuiteB')} color="warning" />
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" color="text.secondary">
            {t('security.footerText')}
          </Typography>
        </Box>
      </Container>
  );
};

export default SecurityPage;