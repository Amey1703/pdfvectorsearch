const dotenv = require("dotenv");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredTool } = require("@langchain/core/tools");
const yahooFinance = require("yahoo-finance2").default;
const readlineSync = require("readline-sync");
const { z } = require("zod");
dotenv.config();

// Text
const model = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",
  apiKey: process.env.GEMINI_API_KEY,
});

async function getStockPrice(symbol) {
  // Batch and stream are also supported
  try {
    const results = await yahooFinance.quote(symbol);
    if (results) {
      return {
        symbol: symbol,
        price: results.regularMarketPrice,
        volume: results.regularMarketVolume,
        name: results.longName,
        currency: results.currency,
      };
    } else {
      throw new Error("Error fetching stock price");
    }
  } catch (error) {
    throw new Error(error.message);
  }
  // console.log(results);
}
// getStockPrice();

// Define Tool
class StockPriceTool extends StructuredTool {
  schema = z.object({
    symbol: z.string().describe("The stock symbol, like AAPL"),
  });

  name = "stock_price";

  description = "Get the current stock price and volume for a given symbol";

  async _call(input) {
    const { symbol } = input;
    try {
      const result = await getStockPrice(symbol);
      return JSON.stringify();
    } catch (error) {
      return `I apologize, but it seems that I am unable to retrieve the current stock price for ${symbol} at the moment.`;
    }
  }
}

async function main() {
  // Bind your tools to the model
  const modelWithTools = model.bind({
    tools: [new StockPriceTool()],
  });
  // Or, you can use `.bindTools` which works the same under the hood
  // const modelWithTools = model.bindTools([new FakeBrowserTool()]);
  const input = readlineSync.question("Enter the question: ");

  const res = await modelWithTools.invoke([
    ["human", input],
  ]);

  console.log(res);
  for(const toolCall of res.tool_calls) {
    if(toolCall.name === "stock_price"){
        const res = await getStockPrice(toolCall.args.symbol)
        console.log("Stock Info: ", res);
    }
  }
 
}
main();
