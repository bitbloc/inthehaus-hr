// Test file for branding injection logic
import { formatWeatherFlex } from '../utils/weather.js';

// Re-declare appendBrandingToFlex function for testing
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
            
            const buttonsBox = {
              type: 'box',
              layout: originalLayout,
              spacing: originalSpacing,
              contents: bubble.footer.contents
            };

            bubble.footer.layout = 'vertical';
            if (bubble.footer.spacing) delete bubble.footer.spacing;
            
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

function test() {
  console.log("Testing appendBrandingToFlex with different inputs...");
  
  // 1. Test weather flex (which has no footer)
  const dummyWeather = {
    current: { temp: 30, humidity: 60, condition: "Sunny", wind: 2 },
    tempDiffText: "same",
    rainBlocks: [],
    hasRain: false,
    employeeAdvice: "None"
  };
  const weatherFlex = formatWeatherFlex(dummyWeather);
  const brandedWeather = appendBrandingToFlex(weatherFlex);
  console.log("\n--- Weather Flex Footer result: ---");
  console.log(JSON.stringify(brandedWeather.contents.footer, null, 2));
  console.log("Weather Flex styles.footer:", brandedWeather.contents.styles.footer);

  // 2. Test dark mode / news flex (which has dark background)
  const darkFlex = {
    type: "flex",
    contents: {
      type: "bubble",
      styles: {
        body: { backgroundColor: "#181818" }
      }
    }
  };
  const brandedDark = appendBrandingToFlex(darkFlex);
  console.log("\n--- Dark Flex Footer styles & contents: ---");
  console.log(JSON.stringify(brandedDark.contents.footer, null, 2));
  console.log("Dark Flex styles.footer:", brandedDark.contents.styles.footer);

  // 3. Test flex with buttons (horizontal layout in footer)
  const buttonsFlex = {
    type: "flex",
    contents: {
      type: "bubble",
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "button", label: "APPROVE", action: { type: "postback", data: "approve" } }
        ]
      }
    }
  };
  const brandedButtons = appendBrandingToFlex(buttonsFlex);
  console.log("\n--- Buttons Flex Footer result: ---");
  console.log(JSON.stringify(brandedButtons.contents.footer, null, 2));

  // 4. Test text footer
  const textFlex = {
    type: "flex",
    contents: {
      type: "bubble",
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "Yuzu AI Assistant 🍊🐱" }
        ]
      }
    }
  };
  const brandedText = appendBrandingToFlex(textFlex);
  console.log("\n--- Text Flex Footer result: ---");
  console.log(JSON.stringify(brandedText.contents.footer, null, 2));
}

test();
