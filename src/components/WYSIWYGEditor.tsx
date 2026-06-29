import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Typography, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface WYSIWYGEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
}

const WYSIWYGEditor: React.FC<WYSIWYGEditorProps> = ({
  label,
  value,
  onChange,
  required = false,
  sensitive = false,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [viewHtml, setViewHtml] = useState(false);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Handle fullscreen toggle using browser API
  const toggleFullscreen = useCallback(() => {
    // Check actual fullscreen state instead of React state for more reliable toggle
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    console.log('toggleFullscreen called, actualFullscreen:', isCurrentlyFullscreen, 'containerRef:', containerRef.current);
    
    if (!containerRef.current) {
      console.log('No containerRef available');
      return;
    }
    
    if (!isCurrentlyFullscreen) {
      // Enter fullscreen
      console.log('Entering fullscreen');
      const element = containerRef.current;
      element.requestFullscreen?.() || 
      (element as any).webkitRequestFullscreen?.() ||
      (element as any).mozRequestFullScreen?.() ||
      (element as any).msRequestFullscreen?.();
    } else {
      // Exit fullscreen
      console.log('Exiting fullscreen');
      document.exitFullscreen?.() ||
      (document as any).webkitExitFullscreen?.() ||
      (document as any).mozCancelFullScreen?.() ||
      (document as any).msExitFullscreen?.();
    }
  }, []);

  // Initialize Quill editor once
  useEffect(() => {
    if (!editorRef.current || quillRef.current) {
      return;
    }
    
    // Create custom toolbar
    const toolbarOptions = disabled ? false : [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean'],
      ['fullscreen'] // Custom button
    ];

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: '', // No placeholder - let users click directly
      readOnly: disabled,
      modules: {
        toolbar: toolbarOptions,
        clipboard: {
          matchVisual: false,
        }
      },
      formats: [
        'header', 'bold', 'italic', 'underline', 'strike',
        'color', 'background', 'list', 'align',
        'link', 'image'
      ]
    });

    quillRef.current = quill;
    
    // Add custom fullscreen handler after toolbar is created
    if (!disabled) {
      const toolbar = quill.getModule('toolbar') as any;
      if (toolbar && toolbar.container) {
        const fullscreenButton = toolbar.container.querySelector('.ql-fullscreen');
        if (fullscreenButton) {
          fullscreenButton.setAttribute('title', 'Toggle Fullscreen');
          fullscreenButton.addEventListener('click', () => {
            toggleFullscreen();
          });
        }
      }
    }

    // Custom link handler
    (quill.getModule('toolbar') as any).addHandler('link', () => {
      const range = quill.getSelection();
      if (range) {
        const text = quill.getText(range.index, range.length);
        setLinkText(text || '');
        setLinkUrl('');
        setLinkDialogOpen(true);
      }
    });

    // Custom image handler - embed as base64
    (quill.getModule('toolbar') as any).addHandler('image', () => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');
      input.click();

      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', reader.result);
          };
          reader.readAsDataURL(file);
        }
      };
    });

    // Set initial content
    if (value) {
      quill.root.innerHTML = value;
    }

    // Ensure the editor is focusable on mobile
    const editorElement = quill.root;
    if (editorElement) {
      editorElement.setAttribute('contenteditable', 'true');
      editorElement.style.webkitUserSelect = 'text';
      editorElement.style.userSelect = 'text';
      editorElement.style.cursor = 'text';
      
      // Only force focus on empty editor, otherwise let browser handle cursor positioning
      const handleTouch = (e: Event) => {
        if (!disabled) {
          const length = quill.getLength();
          // Only intervene if editor is empty
          if (length <= 1) {
            e.preventDefault();
            setTimeout(() => {
              quill.focus();
              quill.setSelection(0, 0);
            }, 0);
          }
          // Otherwise let the native touch handling position the cursor
        }
      };
      
      editorElement.addEventListener('touchstart', handleTouch, { passive: false });
      
      return () => {
        editorElement.removeEventListener('touchstart', handleTouch);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Register text-change listener (separate effect so it re-registers after cleanup)
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) {
      return;
    }

    const handleTextChange = () => {
      const html = quill.root.innerHTML;
      const cleanHtml = html === '<p><br></p>' ? '' : html;
      onChangeRef.current(cleanHtml);
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
    };
  }); // No dependencies - runs on every render to ensure listener is always registered

  // Update disabled state
  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.enable(!disabled);
    }
  }, [disabled]);

  // Handle link creation
  const handleInsertLink = () => {
    if (!quillRef.current || !linkUrl.trim()) return;

    const range = quillRef.current.getSelection();
    if (range) {
      if (linkText.trim()) {
        // Insert new link with text
        quillRef.current.insertText(range.index, linkText, 'link', linkUrl);
      } else {
        // Format existing selection as link
        quillRef.current.format('link', linkUrl);
      }
    }
    
    setLinkDialogOpen(false);
    setLinkText('');
    setLinkUrl('');
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      console.log('Fullscreen change detected:', isFs);
      setIsFullscreen(isFs);
      
      // Update toolbar button active state
      if (quillRef.current) {
        const toolbar = quillRef.current.getModule('toolbar') as any;
        const fullscreenButton = toolbar?.container?.querySelector('.ql-fullscreen');
        if (fullscreenButton) {
          if (isFs) {
            fullscreenButton.classList.add('ql-active');
          } else {
            fullscreenButton.classList.remove('ql-active');
          }
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Handle drag and drop for images
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (disabled || !quillRef.current) return;

    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const range = quillRef.current!.getSelection() || { index: 0, length: 0 };
        quillRef.current!.insertEmbed(range.index, 'image', result);
      };
      reader.readAsDataURL(file);
    });
  }, [disabled]);

  // Handle paste for images
  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    if (disabled || !quillRef.current) return;

    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const range = quillRef.current!.getSelection() || { index: 0, length: 0 };
          quillRef.current!.insertEmbed(range.index, 'image', result);
        };
        reader.readAsDataURL(file);
      }
    });
  }, [disabled]);

  return (
    <>
      <Box sx={{ mb: 2 }}>
        {/* Header with Label and HTML View Toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography 
            variant="subtitle2" 
            sx={{ 
              color: sensitive ? 'error.main' : 'text.primary',
              fontWeight: required ? 600 : 400,
            }}
          >
            {label} {required && '*'} {sensitive && '🔒'}
          </Typography>
          <Button
            size="small"
            onClick={() => setViewHtml(!viewHtml)}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
            disabled={disabled}
          >
            {viewHtml ? '📝 Editor' : '📄 HTML'}
          </Button>
        </Box>
        
        {/* Quill Editor */}
        <Paper 
            ref={containerRef}
            className="wysiwyg-editor-container"
            variant="outlined"
            sx={{ 
            border: '1px solid',
            borderColor: disabled ? 'action.disabled' : 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: disabled ? 'action.disabledBackground' : 'background.paper',
            minHeight: 300,
            // Fullscreen styles
            ...(isFullscreen && {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
              borderRadius: 0,
              border: 'none',
              '& .ql-container': {
                height: 'calc(100vh - 42px) !important',
              },
              '& .ql-editor': {
                height: 'calc(100vh - 84px) !important',
                padding: 4,
              },
            }),
            '& .ql-container': {
              minHeight: 250,
              fontSize: '14px',
              fontFamily: 'inherit',
              backgroundColor: 'background.paper',
            },
            '& .ql-editor': {
              minHeight: 250,
              padding: 2,
              lineHeight: 1.6,
              backgroundColor: 'background.paper !important',
              color: 'text.primary !important',
              outline: 'none !important',
              border: 'none !important',
              '&:focus': {
                outline: 'none !important',
                border: 'none !important',
              },
            },
            '& .ql-toolbar': {
              borderBottom: '2px solid',
              borderBottomColor: theme.palette.divider,
              backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
              padding: '8px',
              borderTopLeftRadius: '4px',
              borderTopRightRadius: '4px',
            },
            '& .ql-toolbar .ql-stroke': {
              stroke: `${theme.palette.text.primary} !important`,
            },
            '& .ql-toolbar .ql-fill': {
              fill: `${theme.palette.text.primary} !important`,
            },
            '& .ql-toolbar .ql-picker-label': {
              color: `${theme.palette.text.primary} !important`,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '3px',
              '&:hover': {
                backgroundColor: theme.palette.action.selected,
              },
            },
            '& .ql-toolbar button': {
              border: '1px solid transparent',
              borderRadius: '3px',
              '&:hover': {
                backgroundColor: theme.palette.action.selected,
                borderColor: theme.palette.divider,
              },
              '&.ql-active': {
                backgroundColor: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
                '& .ql-stroke': {
                  stroke: `${theme.palette.primary.contrastText} !important`,
                },
                '& .ql-fill': {
                  fill: `${theme.palette.primary.contrastText} !important`,
                },
              },
            },
            '& .ql-toolbar .ql-picker-options': {
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              boxShadow: theme.shadows[3],
            },
            '& .ql-toolbar .ql-picker-item': {
              color: theme.palette.text.primary,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            },
            // Custom fullscreen button styling to match native Quill buttons
            '& .ql-fullscreen': {
              width: '28px !important',
              height: '28px !important',
              padding: '5px',
              border: '1px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '3px',
              display: 'inline-block',
              position: 'relative',
              '&:before': {
                content: '"⤢"',
                fontSize: '16px',
                lineHeight: '18px',
                display: 'block',
                textAlign: 'center',
                color: theme.palette.text.primary,
                fontFamily: '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
                fontWeight: 'bold',
              },
              '&:hover': {
                backgroundColor: theme.palette.action.selected,
                borderColor: theme.palette.divider,
                '&:before': {
                  color: theme.palette.text.primary,
                },
              },
            },
            '& .ql-fullscreen.ql-active': {
              backgroundColor: theme.palette.primary.main,
              borderColor: theme.palette.primary.main,
              '&:before': {
                content: '"⤡"',
                color: theme.palette.primary.contrastText,
              },
            },
            '& .ql-editor.ql-blank::before': {
              color: 'text.disabled !important',
              fontStyle: 'normal',
            },
            '& .ql-snow': {
              border: 'none',
              backgroundColor: 'background.paper',
            },
            '& .ql-snow .ql-tooltip': {
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '4px',
              boxShadow: theme.shadows[4],
              color: theme.palette.text.primary,
              zIndex: 1000,
            },
            '& .ql-snow .ql-tooltip input[type=text]': {
              backgroundColor: theme.palette.background.default,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '3px',
              color: theme.palette.text.primary,
              padding: '5px',
            },
            '& .ql-snow .ql-tooltip a': {
              color: theme.palette.primary.main,
            },
            // Toolbar button tooltips (native browser title attribute)
            '& .ql-toolbar button[title]': {
              position: 'relative',
            },
            // Ensure text content is visible
            '& .ql-editor p': {
              color: 'text.primary !important',
            },
            '& .ql-editor h1, & .ql-editor h2, & .ql-editor h3, & .ql-editor h4, & .ql-editor h5, & .ql-editor h6': {
              color: 'text.primary !important',
            },
            '& .ql-editor strong': {
              color: 'text.primary !important',
            },
            '& .ql-editor em': {
              color: 'text.primary !important',
            },
            '& .ql-editor u': {
              color: 'text.primary !important',
            },
            '& .ql-editor s': {
              color: 'text.primary !important',
            },
            '& .ql-editor a': {
              color: 'primary.main !important',
            },
            '& .ql-editor ol, & .ql-editor ul': {
              color: 'text.primary !important',
            },
            '& .ql-editor li': {
              color: 'text.primary !important',
            },
            // Image styling
            '& .ql-editor img': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 1,
              boxShadow: 1,
            },
          }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={handlePaste}
          onClick={() => {
            // Ensure editor gets focus when clicking anywhere on the Paper
            if (quillRef.current && !disabled) {
              quillRef.current.focus();
            }
          }}
        >
          {viewHtml ? (
            <TextField
              multiline
              fullWidth
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              minRows={15}
              sx={{ 
                '& .MuiInputBase-root': { 
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  padding: 2,
                }
              }}
            />
          ) : (
            <div ref={editorRef} />
          )}
        </Paper>
      </Box>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('wysiwyg.insertLink', 'Insert Link')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('wysiwyg.linkTextOptional', 'Link Text (optional)')}
            fullWidth
            variant="outlined"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder={t('wysiwyg.leaveEmptyForSelected', 'Leave empty to use selected text')}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label={t('wysiwyg.url', 'URL')}
            fullWidth
            variant="outlined"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            type="url"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleInsertLink} variant="contained" disabled={!linkUrl.trim()}>
            Insert Link
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default React.memo(WYSIWYGEditor);