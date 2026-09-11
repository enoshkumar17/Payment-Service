import mongoose from "mongoose"
import { Ledger } from "./ledger.model.js"

const accountSchema = new mongoose.Schema({
  user:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:[true,'Account must be associated with a user'],
    index:true
  },
  status:{
    type:String,
    enum:{
      values:["ACTIVE","FROZEN","CLOSED"],
      message:"Status can be either ACTIVE, FROZEN or CLOSED"
    },
    default:"ACTIVE"
  },
  currency:{
    type:String,
    required:[true,'Currenc is required for creating an account'],
    default:"INR"
  },
  username:{
    type:String,
    required:[true,"User name is required"]
  }
},{timestamps:true})

accountSchema.methods.getBalance = async function(options = {}){
  const aggregateOptions = options.session ? { session: options.session } : {};
  const balanceData = await Ledger.aggregate([
    {
      $match:{
      account:this._id
      }
    },
    {
      $group:{
        _id:null,
        totalDebit:{
          $sum:{
            $cond:[
              { $eq: ["$type","Debit"]},
              "$amount",
              0
            ]
          }
        },
        totalCredit:{
          $sum:{
            $cond:[
              {$eq:["$type","Credit"]},
              "$amount",
              0
            ]
          }
        }
    }
    },
    {
      $project:{
        _id:0,
        balance:{$subtract:["$totalCredit","$totalDebit"]}
      }
    }
    ], aggregateOptions)

  return balanceData[0]?.balance ?? 0;
}

accountSchema.index({ user:1, status:1 })

export const Account = mongoose.model("Account",accountSchema);
