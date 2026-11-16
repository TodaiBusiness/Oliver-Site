import { createContext, useContext } from 'react';

/** Quem está em volta da página: nome da área (para título e migalhas). */
export const PanelContext = createContext({ scope: 'Painel', home: '/' });
export const usePanel = () => useContext(PanelContext);
