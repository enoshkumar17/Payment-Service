import mongoose from "mongoose"

const transactionSchema = new mongoose.Schema({
  fromAccount:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: [true,"From Account is required in Transaction"],
    index: true
  },
  toAccount:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: [true,"To Account is required in Transaction"],
    index:true
  },
  amount:{
    type:Number,
    required:[true,"Amount should be greater than Zero"],
  },
  status:{
    type:String,
    enum:{
      values:['PENDING','PROCESSING','SUCCEEDED','FAILED','REVERSED'],
      message:"Payment status must be PENDING, PROCESSING, SUCCEEDED, FAILED, or REVERSED"},
    default:'PENDING'
  },
  idempotencyKey:{
    type:String,
    required:true,
    unique:true
  }
},{timestamps:true})

export const Transaction = mongoose.model("Transaction",transactionSchema)