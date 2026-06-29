import React from 'react';
import WYSIWYGEditor from './WYSIWYGEditor';

interface DualEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
  defaultMode?: 'markdown' | 'wysiwyg'; // Keep for backwards compatibility but ignored
  userId?: string; // Keep for backwards compatibility but no longer used
  privateKey?: string; // Keep for backwards compatibility but no longer used
  folderId?: string; // Keep for backwards compatibility but no longer used
  participants?: string[]; // Keep for backwards compatibility but no longer used
  onImageAttachment?: any; // Keep for backwards compatibility but no longer used
}

const DualEditor: React.FC<DualEditorProps> = ({
  label,
  value,
  onChange,
  required = false,
  sensitive = false,
  disabled = false,
}) => {
  // Simply render the WYSIWYG editor - markdown mode removed, images embedded as base64
  return (
    <WYSIWYGEditor
      label={label}
      value={value}
      onChange={onChange}
      required={required}
      sensitive={sensitive}
      disabled={disabled}
    />
  );
};

export default DualEditor;