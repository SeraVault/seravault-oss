import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#00ff41', // Matrix/terminal green
      light: '#39ff14', // Neon green for lighter accents
      dark: '#00b82e',
      contrastText: '#000000',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

export default theme;
