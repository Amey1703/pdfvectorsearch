const dotenv = require('dotenv');
const { AgentExecutor } = require("langchain/agents");
const { StructuredTool } = require("langchain/tools");
const { OpenAIAssistantRunnable } = require("langchain/experimental/openai_assistant");
const { z } = require("zod");
const weather = require('openweather-apis')
const readlineSync = require('readline-sync');

dotenv.config();


async function getTodaysWeather(city) {
    return new Promise((resolve, reject) => {
        weather.setLang('en');
        weather.setCity(city);
        weather.setAPPID(process.env.OPENWEATHER_APPID);
        weather.getTemperature(function(err, temp) {
            if (err) {
                reject(err);
            } else {
                resolve(temp);
            }
        });
    });
}

// getTodaysWeather(city);

class WeatherTool extends StructuredTool {
    schema = z.object({
        location: z.string().describe("The city, e.g. Mumbai"),
    });

    name = "get_current_weather";

    description = "Get the current weather in a given location";

    constructor() {
        super(...arguments);
    }

    async _call(input) {
        const { location } = input;
        try {
            const result = await getTodaysWeather(location);
            return JSON.stringify({ location, temperature: result, unit: "celsius" });
        } catch (error) {
            return `I apologize, but it seems that I am unable to retrieve the current weather for ${location} at the moment.`;
        }
    }
}

  const tools = [new WeatherTool()];

  async function main(){
    const agent = await OpenAIAssistantRunnable.createAssistant({
        clientOptions: { apiKey: process.env.OPENAI_API_KEY },
        model: "gpt-3.5-turbo",
        instructions:
          "You are a weather bot. Use the provided functions to answer questions.",
        name: "Weather Assistant",
        tools,
        asAgent: true,
    });
    // console.log(agent);
      const agentExecutor = AgentExecutor.fromAgentAndTools({
        agent,
        tools,
      });
    //   console.log(agentExecutor)
    const userInput = readlineSync.question("Enter the city: ")


      const assistantResponse = await agentExecutor.invoke({
        content: userInput,
      });
      console.log(assistantResponse);
    
}

main()