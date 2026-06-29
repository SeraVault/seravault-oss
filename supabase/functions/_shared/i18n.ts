/**
 * Internationalization (i18n) utilities for Supabase Edge Functions
 * Supports: English (en), Spanish (es), French (fr), German (de)
 */

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de';

// Notification translations
const translations: Record<
  SupportedLanguage,
  Record<string, Record<string, string>>
> = {
  en: {
    fileShared: {
      title: 'New file shared with you',
      message: '{{senderName}} shared a file with you',
    },
    fileModified: {
      title: 'Shared file updated',
      message: '{{senderName}} modified a shared file',
    },
    contactRequest: {
      title: 'New contact request',
      messageWithText: '{{senderName}} wants to connect with you: "{{message}}"',
      messageWithoutText: '{{senderName}} wants to connect with you',
    },
    contactAccepted: {
      title: 'Contact request accepted',
      message: '{{senderName}} accepted your contact request',
    },
    fileShareRequest: {
      title: 'File sharing request from unknown user',
      message:
        '{{senderName}} (not in your contacts) wants to share a file with you',
    },
    chatMessage: {
      groupTitle: 'New message in group chat',
      groupMessage: '{{senderName}} sent a message',
      individualTitle: 'New message from {{senderName}}',
      individualMessage: 'Click to view message',
    },
    invitationAccepted: {
      title: 'Invitation Accepted',
      message: '{{senderName}} accepted your invitation and is now a contact',
    },
    userInvitation: {
      title: '{{senderName}} invited you to SeraVault',
      messageWithText: '"{{message}}"',
      messageWithoutText:
        'Join them on SeraVault for secure, encrypted collaboration',
    },
  },
  es: {
    fileShared: {
      title: 'Nuevo archivo compartido contigo',
      message: '{{senderName}} compartió un archivo contigo',
    },
    fileModified: {
      title: 'Archivo compartido actualizado',
      message: '{{senderName}} modificó un archivo compartido',
    },
    contactRequest: {
      title: 'Nueva solicitud de contacto',
      messageWithText:
        '{{senderName}} quiere conectarse contigo: "{{message}}"',
      messageWithoutText: '{{senderName}} quiere conectarse contigo',
    },
    contactAccepted: {
      title: 'Solicitud de contacto aceptada',
      message: '{{senderName}} aceptó tu solicitud de contacto',
    },
    fileShareRequest: {
      title: 'Solicitud para compartir archivo de usuario desconocido',
      message:
        '{{senderName}} (no está en tus contactos) quiere compartir un archivo contigo',
    },
    chatMessage: {
      groupTitle: 'Nuevo mensaje en chat grupal',
      groupMessage: '{{senderName}} envió un mensaje',
      individualTitle: 'Nuevo mensaje de {{senderName}}',
      individualMessage: 'Haz clic para ver el mensaje',
    },
    invitationAccepted: {
      title: 'Invitación aceptada',
      message:
        '{{senderName}} aceptó tu invitación y ahora es un contacto',
    },
    userInvitation: {
      title: '{{senderName}} te invitó a SeraVault',
      messageWithText: '"{{message}}"',
      messageWithoutText:
        'Únete a ellos en SeraVault para colaboración segura y cifrada',
    },
  },
  fr: {
    fileShared: {
      title: 'Nouveau fichier partagé avec vous',
      message: '{{senderName}} a partagé un fichier avec vous',
    },
    fileModified: {
      title: 'Fichier partagé mis à jour',
      message: '{{senderName}} a modifié un fichier partagé',
    },
    contactRequest: {
      title: 'Nouvelle demande de contact',
      messageWithText:
        '{{senderName}} souhaite se connecter avec vous: "{{message}}"',
      messageWithoutText: '{{senderName}} souhaite se connecter avec vous',
    },
    contactAccepted: {
      title: 'Demande de contact acceptée',
      message: '{{senderName}} a accepté votre demande de contact',
    },
    fileShareRequest: {
      title: "Demande de partage de fichier d'un utilisateur inconnu",
      message:
        "{{senderName}} (pas dans vos contacts) souhaite partager un fichier avec vous",
    },
    chatMessage: {
      groupTitle: 'Nouveau message dans le chat de groupe',
      groupMessage: '{{senderName}} a envoyé un message',
      individualTitle: 'Nouveau message de {{senderName}}',
      individualMessage: 'Cliquez pour voir le message',
    },
    invitationAccepted: {
      title: 'Invitation acceptée',
      message:
        '{{senderName}} a accepté votre invitation et est maintenant un contact',
    },
    userInvitation: {
      title: '{{senderName}} vous a invité sur SeraVault',
      messageWithText: '"{{message}}"',
      messageWithoutText:
        'Rejoignez-les sur SeraVault pour une collaboration sécurisée et chiffrée',
    },
  },
  de: {
    fileShared: {
      title: 'Neue Datei mit Ihnen geteilt',
      message: '{{senderName}} hat eine Datei mit Ihnen geteilt',
    },
    fileModified: {
      title: 'Geteilte Datei aktualisiert',
      message: '{{senderName}} hat eine geteilte Datei geändert',
    },
    contactRequest: {
      title: 'Neue Kontaktanfrage',
      messageWithText:
        '{{senderName}} möchte sich mit Ihnen verbinden: "{{message}}"',
      messageWithoutText: '{{senderName}} möchte sich mit Ihnen verbinden',
    },
    contactAccepted: {
      title: 'Kontaktanfrage akzeptiert',
      message: '{{senderName}} hat Ihre Kontaktanfrage akzeptiert',
    },
    fileShareRequest: {
      title: 'Dateifreigabeanfrage von unbekanntem Benutzer',
      message:
        '{{senderName}} (nicht in Ihren Kontakten) möchte eine Datei mit Ihnen teilen',
    },
    chatMessage: {
      groupTitle: 'Neue Nachricht im Gruppenchat',
      groupMessage: '{{senderName}} hat eine Nachricht gesendet',
      individualTitle: 'Neue Nachricht von {{senderName}}',
      individualMessage: 'Klicken Sie, um die Nachricht anzuzeigen',
    },
    invitationAccepted: {
      title: 'Einladung angenommen',
      message:
        '{{senderName}} hat Ihre Einladung angenommen und ist jetzt ein Kontakt',
    },
    userInvitation: {
      title: '{{senderName}} hat Sie zu SeraVault eingeladen',
      messageWithText: '"{{message}}"',
      messageWithoutText:
        'Treten Sie ihnen auf SeraVault für sichere, verschlüsselte Zusammenarbeit bei',
    },
  },
};

/**
 * Get translated text
 */
export function t(
  key: string,
  language: SupportedLanguage = 'en',
  variables?: Record<string, string>
): string {
  const [section, subkey] = key.split('.');

  const translation =
    translations[language]?.[section]?.[subkey] ||
    translations.en[section]?.[subkey] ||
    key;

  if (!variables) {
    return translation;
  }

  // Replace variables in translation
  let result = translation;
  for (const [varKey, varValue] of Object.entries(variables)) {
    result = result.replace(`{{${varKey}}}`, varValue);
  }

  return result;
}

/**
 * Get user's preferred language from database
 */
export async function getUserLanguage(
  supabase: any,
  userId: string
): Promise<SupportedLanguage> {
  const { data, error } = await supabase
    .from('users')
    .select('language')
    .eq('uid', userId)
    .maybeSingle();

  if (error || !data || !data.language) {
    return 'en'; // Default to English
  }

  const lang = data.language.toLowerCase();

  // Validate language is supported
  if (['en', 'es', 'fr', 'de'].includes(lang)) {
    return lang as SupportedLanguage;
  }

  return 'en';
}

/**
 * Get user's display name
 */
export async function getUserDisplayName(
  supabase: any,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('display_name, email')
    .eq('uid', userId)
    .maybeSingle();

  if (error || !data) {
    return 'Unknown User';
  }

  return data.display_name || data.email || 'Unknown User';
}
