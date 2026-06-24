
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { format, addHours, startOfWeek, addDays, parseISO } from 'date-fns';
import { getEffectiveRoster } from '../utils/roster.js';
import { supabase } from '../lib/supabaseClient.js';

function appendBrandingToFlex(msg) {
  if (!msg) return msg;

  if (Array.isArray(msg)) {
    return msg.map(m => appendBrandingToFlex(m));
  }

  if (msg.type !== 'flex' || !msg.contents) {
    return msg;
  }

  const newMsg = JSON.parse(JSON.stringify(msg));
  
  const addFooterToBubble = (bubble) => {
    if (!bubble || bubble.type !== 'bubble') return;

    if (bubble.footer) {
      if (bubble.footer.contents && Array.isArray(bubble.footer.contents)) {
        const hasBranding = bubble.footer.contents.some(
          c => c.type === 'text' && c.text && c.text.includes('ONHAUS SYSTEM')
        );
        if (!hasBranding) {
          const hasButtons = bubble.footer.contents.some(c => c.type === 'button');
          if (hasButtons) {
            const originalLayout = bubble.footer.layout || 'horizontal';
            const originalSpacing = bubble.footer.spacing || 'sm';
            const originalPadding = bubble.footer.paddingAll;
            
            const buttonsBox = {
              type: 'box',
              layout: originalLayout,
              spacing: originalSpacing,
              contents: [...bubble.footer.contents]
            };

            bubble.footer.layout = 'vertical';
            if (bubble.footer.spacing) delete bubble.footer.spacing;
            if (!bubble.footer.paddingAll) bubble.footer.paddingAll = '15px';
            
            bubble.footer.contents = [
              buttonsBox,
              {
                type: 'text',
                text: 'ONHAUS SYSTEM ©',
                size: 'xxs',
                color: '#aaaaaa',
                align: 'center',
                weight: 'bold',
                margin: 'md'
              }
            ];
          } else {
            const textElement = bubble.footer.contents.find(c => c.type === 'text');
            if (textElement) {
              if (textElement.text && !textElement.text.includes('ONHAUS SYSTEM')) {
                textElement.text = `${textElement.text.toUpperCase()} // ONHAUS SYSTEM ©`;
              }
            } else {
              bubble.footer.contents.push({
                type: 'text',
                text: 'ONHAUS SYSTEM ©',
                size: 'xxs',
                color: '#aaaaaa',
                align: 'center',
                weight: 'bold'
              });
            }
          }
        }
      } else {
        bubble.footer = {
          type: 'box',
          layout: 'vertical',
          paddingAll: '15px',
          contents: [
            {
              type: 'text',
              text: 'ONHAUS SYSTEM ©',
              size: 'xxs',
              color: '#aaaaaa',
              align: 'center',
              weight: 'bold'
            }
          ]
        };
      }
    } else {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'ONHAUS SYSTEM ©',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            weight: 'bold'
          }
        ]
      };
    }

    if (!bubble.styles) bubble.styles = {};
    if (!bubble.styles.footer) {
      const bodyBg = bubble.styles.body?.backgroundColor;
      if (bodyBg === '#181818') {
        bubble.styles.footer = { backgroundColor: '#181818' };
        const copyrightText = bubble.footer.contents.find(c => c.type === 'text' && c.text && c.text.includes('ONHAUS SYSTEM'));
        if (copyrightText) {
          copyrightText.color = '#666666';
        }
      } else {
        bubble.styles.footer = { backgroundColor: '#ebebeb' };
      }
    }
  };

  if (newMsg.contents.type === 'bubble') {
    addFooterToBubble(newMsg.contents);
  } else if (newMsg.contents.type === 'carousel' && Array.isArray(newMsg.contents.contents)) {
    newMsg.contents.contents.forEach(b => addFooterToBubble(b));
  }

  return newMsg;
}

// Load stcalendar handler
import { handleRosterCommand } from './temp_roster_handler_3.mjs';

async function run() {
    const mockClient = {
        replyMessage: async (token, message) => {
            console.log("Original Message:", JSON.stringify(message, null, 2));
            const branded = appendBrandingToFlex(message);
            console.log("\nBranded Message:", JSON.stringify(branded, null, 2));
            return true;
        }
    };

    const mockEvent = {
        replyToken: 'test_token'
    };

    await handleRosterCommand(mockEvent, mockClient, 'stcalendar', 'stcalendar', 'test_user');
}

run().catch(console.error);
