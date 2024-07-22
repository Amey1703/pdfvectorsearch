const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
dotenv.config();

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function setLightValues(brightness, colorTemp) {
  try {
    return { brightness: brightness, colorTemp: colorTemp };
  } catch (error) {
    console.error("Error setting light values.");
  }
}

const controlLightFunctionDeclaration = {
  name: "controlLight",
  parameters: {
    type: "OBJECT",
    description: "Set the brightness and color temperature of a room light.",
    properties: {
      brightness: {
        type: "NUMBER",
        description:
          "Light level from 0 to 100. Zero is off and 100 is full brightness.",
      },
      colorTemperature: {
        type: "STRING",
        description:
          "Color temperature of the light fixture which can be `daylight`, `cool` or `warm`.",
      },
    },
    required: ["brightness", "colorTemperature"],
  },
};

// Executable function code. Put it in a map keyed by the function name
// so that you can call it once you get the name string from the model.
const functions = {
  controlLight: ({ brightness, colorTemp }) => {
    return setLightValues(brightness, colorTemp);
  },
};

// Model
const generativeModel = genAI.getGenerativeModel({
  // Use a model that supports function calling, like a Gemini 1.5 model
  model: "gemini-1.5-flash-latest",

  // Specify the function declaration.
  tools: {
    functionDeclarations: [controlLightFunctionDeclaration],
  },
});

async function main() {
  const chat = generativeModel.startChat();
  const prompt = "Dim the lights so the room feels cozy and warm.";

  // Send the message to the model.
  const result = await chat.sendMessage(prompt);
  //   console.log(result);

  // For simplicity, this uses the first function call found.
  const call = result.response.functionCalls()[0];
//   console.log(call);

  if (call) {
    // Call the executable function named in the function call
    // with the arguments specified in the function call and
    // let it call the hypothetical API.
    const apiResponse = await functions[call.name](call.args);
    // console.log(apiResponse);

    // Send the API response back to the model so it can generate
    // a text response that can be displayed to the user.
    const result2 = await chat.sendMessage([
      {
        functionResponse: {
          name: "controlLight",
          response: apiResponse,
        },
      },
    ]);

    // Log the text response.
    console.log(result2.response.text());
  }
}
main();
